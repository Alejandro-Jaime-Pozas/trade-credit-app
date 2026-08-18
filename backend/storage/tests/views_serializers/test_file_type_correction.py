"""
Correcting a document's file type by hand.

GPT classification can get a document wrong, and a mislabelled file silently fails to
satisfy the requirement it should — so `file_type_name` is writable on PATCH. It is not
free text though: requirements are matched on this exact key, so an unrecognised value
would produce a document that can never satisfy anything.
"""

from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer
from identity.models import Organization, User
from storage.models import FileType, UploadDocument


def make_org(name='Acme', domain='acme.com'):
    return Organization.objects.create(name=name, email_domain=domain)


def make_user_in_org(org, email='user@acme.com'):
    user = User.objects.create_user(email=email)
    user.organizations.add(org)
    return user


def make_client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_document(org, file_type_name='unknown'):
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    return UploadDocument.objects.create(
        customer=customer,
        file=SimpleUploadedFile('doc.pdf', b'content', content_type='application/pdf'),
        file_type_name=file_type_name,
    )


def make_file_type(key='bank_statement', label='Bank statement', organization=None):
    # The app-provided (global) catalog is already seeded by migration, so creating a
    # global key again would violate unique_global_file_type_key — reuse what's there.
    file_type, _ = FileType.objects.get_or_create(
        key=key,
        organization=organization,
        defaults={
            'label_en': label,
            'label_es': label,
            'category': 'financial',
        },
    )
    return file_type


@pytest.mark.django_db
def test_user_can_correct_a_misclassified_document():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    make_file_type()
    doc = make_document(org, file_type_name='unknown')

    res = client.patch(
        reverse('uploaddocument-detail', args=[doc.id]),
        data={'file_type_name': 'bank_statement'},
    )

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.file_type_name == 'bank_statement'


@pytest.mark.django_db
def test_correcting_back_to_unknown_is_allowed():
    """`unknown` is the classifier's own "no idea" bucket, so it stays a valid choice."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    make_file_type()
    doc = make_document(org, file_type_name='bank_statement')

    res = client.patch(
        reverse('uploaddocument-detail', args=[doc.id]),
        data={'file_type_name': 'unknown'},
    )

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.file_type_name == 'unknown'


@pytest.mark.django_db
def test_rejects_a_file_type_key_that_does_not_exist():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)

    res = client.patch(
        reverse('uploaddocument-detail', args=[doc.id]),
        data={'file_type_name': 'nonsense_typo'},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'file_type_name' in res.data
    doc.refresh_from_db()
    assert doc.file_type_name == 'unknown'


@pytest.mark.django_db
def test_rejects_a_file_type_belonging_to_another_organization():
    """Org-owned file types are private, so one org can't label documents with another's."""
    org = make_org()
    other_org = make_org('Other', 'other.com')
    client = make_client_for(make_user_in_org(org))
    make_file_type(key='carta_de_poder', label='Carta de poder', organization=other_org)
    doc = make_document(org)

    res = client.patch(
        reverse('uploaddocument-detail', args=[doc.id]),
        data={'file_type_name': 'carta_de_poder'},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'file_type_name' in res.data


@pytest.mark.django_db
@patch('storage.tasks.handle_upload_document_created', return_value={'skipped': True})
def test_file_type_sent_on_create_does_not_bypass_classification(
    mock_handler, django_capture_on_commit_callbacks,
):
    """
    On create the field is still effectively read-only: classification runs after save
    and overwrites whatever the client sent, so a client can't pre-label an upload.

    Classification now runs in a background task queued with `transaction.on_commit`, and
    pytest-django wraps each test in a transaction it rolls back — so those callbacks
    never fire on their own. `django_capture_on_commit_callbacks(execute=True)` is what
    makes them run; without it this test would pass whether or not the task was ever
    queued.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    make_file_type()

    with django_capture_on_commit_callbacks(execute=True):
        res = client.post(
            reverse('uploaddocument-list'),
            data={
                'file': SimpleUploadedFile('doc.pdf', b'content', content_type='application/pdf'),
                'customer': reverse('customer-detail', args=[customer.id]),
                'file_type_name': 'bank_statement',
            },
            format='multipart',
        )

        assert res.status_code == status.HTTP_201_CREATED

    # The classifier (mocked here) is what decides the type, and it ran.
    assert mock_handler.called


@pytest.mark.django_db
def test_a_document_reports_whether_it_is_still_being_classified():
    """
    The API carries the classifier's progress, so the frontend can show a spinner while a
    Celery worker is working instead of a file type that is simply, silently missing.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    pending = make_document(org, file_type_name=None)

    res = client.get(reverse('uploaddocument-detail', args=[pending.id]))

    assert res.status_code == status.HTTP_200_OK
    # Just uploaded, no type yet — a worker is plausibly still on it.
    assert res.data['classification_status'] == 'processing'


@pytest.mark.django_db
def test_a_classified_document_reports_classified():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    make_file_type()
    doc = make_document(org, file_type_name='bank_statement')

    res = client.get(reverse('uploaddocument-detail', args=[doc.id]))

    assert res.status_code == status.HTTP_200_OK
    assert res.data['classification_status'] == 'classified'


@pytest.mark.django_db
def test_correcting_a_type_flips_the_document_to_classified():
    """A hand-set type ends the wait exactly as the classifier's own answer would."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    make_file_type()
    doc = make_document(org, file_type_name=None)

    res = client.patch(
        reverse('uploaddocument-detail', args=[doc.id]),
        data={'file_type_name': 'bank_statement'},
    )

    assert res.status_code == status.HTTP_200_OK
    assert res.data['classification_status'] == 'classified'
