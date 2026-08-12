"""
API tests for uploading a document from the Customer page (no credit_case).

Regression coverage for the bug where POST /upload-documents/ with only a
`customer` field (as sent by the Customer detail page) 500'd, because
handle_upload_document_created() unconditionally required a credit_case.
"""

from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer
from identity.models import Organization, User
from processing.models import CreditCase
from storage.models import UploadDocument


def make_org(name='Acme', domain='acme.com'):
    # Organization.save() runs full_clean, so email_domain must be a valid domain
    # (no underscores) — hence e.g. 'acme.com'.
    return Organization.objects.create(name=name, email_domain=domain)


def make_user_in_org(org, email='user@acme.com'):
    user = User.objects.create_user(email=email)
    user.organizations.add(org)
    return user


def make_client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_customer(org, name='Acme Customer'):
    return Customer.objects.create(organization=org, name=name)


def make_uploaded_file():
    return SimpleUploadedFile('statement.pdf', b'dummy file content', content_type='application/pdf')


@pytest.mark.django_db
@patch('storage.views.handle_upload_document_created', return_value={'skipped': True})
def test_upload_with_customer_only_succeeds(mock_handler):
    # GPT extraction hits a real external API, so it's mocked here — this test
    # is only exercising the upload endpoint's create()/side-effect wiring.
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    customer_url = reverse('customer-detail', args=[customer.id])

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file(), 'customer': customer_url},
        format='multipart',
    )

    assert res.status_code == status.HTTP_201_CREATED
    assert len(res.data) == 1
    doc = UploadDocument.objects.get(id=res.data[0]['id'])
    assert doc.customer_id == customer.id
    assert doc.credit_case_id is None


@pytest.mark.django_db
def test_upload_with_neither_customer_nor_credit_case_rejected():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file()},
        format='multipart',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not UploadDocument.objects.exists()


@pytest.mark.django_db
@patch('storage.views.handle_upload_document_created', side_effect=RuntimeError('boom'))
def test_upload_side_effect_failure_does_not_500(mock_handler):
    """
    A failure in the post-save GPT side effect (e.g. an OpenAI outage) must
    still return 201 with the document saved, not a 500 that rolls back the
    whole (atomic) request.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    customer_url = reverse('customer-detail', args=[customer.id])

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file(), 'customer': customer_url},
        format='multipart',
    )

    assert res.status_code == status.HTTP_201_CREATED
    assert UploadDocument.objects.filter(customer=customer).exists()


@pytest.mark.django_db
@patch('storage.views.handle_upload_document_created', return_value={'skipped': True})
def test_upload_with_credit_case_only_still_succeeds(mock_handler):
    """Regression guard: the existing Credit Case detail page flow must keep working."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)
    credit_case_url = reverse('creditcase-detail', args=[credit_case.id])

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file(), 'credit_case': credit_case_url},
        format='multipart',
    )

    assert res.status_code == status.HTTP_201_CREATED
    doc = UploadDocument.objects.get(id=res.data[0]['id'])
    assert doc.credit_case_id == credit_case.id
    assert doc.customer_id is None
