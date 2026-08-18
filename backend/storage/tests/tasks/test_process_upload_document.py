"""
Tests for the background document-classification task.

Two things here are easy to get wrong and are the reason this file exists:

  - the task must be queued only AFTER the database transaction commits. Queue it any
    earlier and the worker — a separate process on its own connection — looks up a row
    that is not visible yet, finds nothing, and the document is never classified.
  - retries must be limited to OpenAI-side failures. Retrying a bug in our own code just
    repeats it, burns API calls, and buries the traceback.
"""

from unittest.mock import patch

import openai
import pytest

from customers.models import Customer
from identity.models import Organization, User
from processing.models import CreditCase
from storage.models import UploadDocument
from storage.tasks import process_upload_document


def make_org(name='Acme', domain='acme.com'):
    return Organization.objects.create(name=name, email_domain=domain)


def make_doc():
    org = make_org()
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)
    return UploadDocument.objects.create(
        credit_case=credit_case, customer=customer, file='x.pdf',
    )


def openai_error(cls):
    """
    Build an OpenAI exception without a real HTTP response.

    The SDK's error classes expect a live request/response, which a unit test has no way
    to produce, so this bypasses __init__ and constructs a bare instance.
    """
    return cls.__new__(cls)


@pytest.mark.django_db
def test_task_classifies_the_document():
    doc = make_doc()

    with patch('storage.tasks.handle_upload_document_created') as handler:
        handler.return_value = {'ok': True}
        result = process_upload_document(doc.pk)

    handler.assert_called_once()
    assert handler.call_args[0][0].pk == doc.pk
    assert result == {'ok': True}


@pytest.mark.django_db
def test_missing_document_is_skipped_not_retried():
    """
    A document deleted between being queued and being picked up is normal, not a failure.
    Raising here would burn all three retries on something that can never succeed.
    """
    with patch('storage.tasks.handle_upload_document_created') as handler:
        result = process_upload_document(999999)

    assert result is None
    handler.assert_not_called()


@pytest.mark.django_db
def test_openai_failures_are_retried():
    doc = make_doc()

    with patch('storage.tasks.handle_upload_document_created') as handler:
        handler.side_effect = openai_error(openai.RateLimitError)
        with patch.object(process_upload_document, 'retry') as retry:
            retry.side_effect = RuntimeError('retry called')
            with pytest.raises(RuntimeError, match='retry called'):
                process_upload_document(doc.pk)

    retry.assert_called_once()


@pytest.mark.django_db
def test_our_own_bugs_are_not_retried():
    """A TypeError is a code defect — it must surface once, not three times."""
    doc = make_doc()

    with patch('storage.tasks.handle_upload_document_created') as handler:
        handler.side_effect = TypeError('bug in our code')
        with patch.object(process_upload_document, 'retry') as retry:
            with pytest.raises(TypeError):
                process_upload_document(doc.pk)

    retry.assert_not_called()


# ---------------------------------------------------------------------------
# Dispatch from the upload endpoint
# ---------------------------------------------------------------------------

def make_user_client(org):
    from rest_framework.test import APIClient

    user = User.objects.create_user(email='user@acme.com')
    user.organizations.add(org)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_upload_returns_immediately_and_queues_the_work(django_capture_on_commit_callbacks):
    """
    The whole point of the change: the response comes back with the document saved but
    NOT yet classified, and the classification is queued to run afterwards.

    `django_capture_on_commit_callbacks` is required — pytest-django runs each test inside
    a transaction it rolls back, so `transaction.on_commit` callbacks never fire on their
    own. Without this fixture the assertions below would pass while proving nothing.
    """
    from django.urls import reverse
    from django.core.files.uploadedfile import SimpleUploadedFile
    from rest_framework import status

    org = make_org()
    client = make_user_client(org)
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)

    with patch('storage.tasks.handle_upload_document_created') as handler:
        with django_capture_on_commit_callbacks(execute=True) as callbacks:
            res = client.post(
                reverse('uploaddocument-list'),
                data={
                    'file': SimpleUploadedFile('statement.pdf', b'%PDF-1.4 fake'),
                    'credit_case': reverse('creditcase-detail', args=[credit_case.id]),
                    'customer': reverse('customer-detail', args=[customer.id]),
                },
                format='multipart',
            )

            assert res.status_code == status.HTTP_201_CREATED
            # Returned before classification: exactly what the frontend renders as
            # "Pending classification".
            assert res.data[0]['file_type_name'] is None
            # ...and nothing has run yet, because the transaction hasn't committed.
            handler.assert_not_called()

    # One job queued per uploaded document, and it ran once the commit happened.
    assert len(callbacks) == 1
    handler.assert_called_once()
