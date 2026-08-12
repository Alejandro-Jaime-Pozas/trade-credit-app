"""
API tests for UploadDocument tenant isolation.

Regression coverage for cross-tenant write gaps: `customer` and `credit_case`
were both writable FKs with unfiltered querysets, so a user in one
organization could upload a document straight onto another organization's
Customer or CreditCase, or link a document to a customer and credit_case that
belong to two DIFFERENT organizations. Fixed via
UploadDocumentViewSet.organization_scoped_fields (OrganizationScopedMixin) and
an extra UploadDocumentSerializer.validate() cross-consistency check. Also
covers `uploaded_by` now being set on successful upload.
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
def test_upload_for_own_customer_succeeds_and_sets_uploaded_by(mock_handler):
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file(), 'customer': reverse('customer-detail', args=[customer.id])},
        format='multipart',
    )

    assert res.status_code == status.HTTP_201_CREATED
    doc = UploadDocument.objects.get(id=res.data[0]['id'])
    assert doc.customer_id == customer.id
    assert doc.uploaded_by_id == user.id


@pytest.mark.django_db
def test_upload_rejects_another_organizations_customer():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    other_customer = make_customer(other_org, name='Other Customer')

    res = client.post(
        reverse('uploaddocument-list'),
        data={'file': make_uploaded_file(), 'customer': reverse('customer-detail', args=[other_customer.id])},
        format='multipart',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not UploadDocument.objects.exists()


@pytest.mark.django_db
def test_upload_rejects_another_organizations_credit_case():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    other_customer = make_customer(other_org, name='Other Customer')
    other_credit_case = CreditCase.objects.create(customer=other_customer)

    res = client.post(
        reverse('uploaddocument-list'),
        data={
            'file': make_uploaded_file(),
            'credit_case': reverse('creditcase-detail', args=[other_credit_case.id]),
        },
        format='multipart',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not UploadDocument.objects.exists()


@pytest.mark.django_db
def test_upload_rejects_customer_and_credit_case_from_different_customers():
    """
    Both FKs individually belong to the user's own organization, but to two
    DIFFERENT customer records — organization_scoped_fields alone can't catch
    this (each field passes its own check), so this is enforced by
    UploadDocumentSerializer.validate()'s cross-consistency check instead.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer_a = make_customer(org, name='Customer A')
    customer_b = make_customer(org, name='Customer B')
    credit_case_for_b = CreditCase.objects.create(customer=customer_b)

    res = client.post(
        reverse('uploaddocument-list'),
        data={
            'file': make_uploaded_file(),
            'customer': reverse('customer-detail', args=[customer_a.id]),
            'credit_case': reverse('creditcase-detail', args=[credit_case_for_b.id]),
        },
        format='multipart',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not UploadDocument.objects.exists()
