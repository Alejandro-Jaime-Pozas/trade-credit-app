"""
API tests for CustomerContact tenant isolation.

Regression coverage for a cross-tenant write gap: `customer` was a writable FK
with an unfiltered queryset, so a user in one organization could attach a
contact to another organization's Customer. Fixed via
CustomerContactViewSet.organization_scoped_fields (OrganizationScopedMixin) and
CustomerContactSerializer.validate() deriving `organization` from
`customer.organization`.
"""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer, CustomerContact
from identity.models import Organization, User


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


@pytest.mark.django_db
def test_create_contact_for_own_customer_succeeds_and_derives_organization():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    res = client.post(
        reverse('customercontact-list'),
        data={
            'customer': reverse('customer-detail', args=[customer.id]),
            'first_name': 'Jane',
            'last_name': 'Doe',
            'email': 'jane@acme.com',
        },
    )

    assert res.status_code == status.HTTP_201_CREATED
    contact = CustomerContact.objects.get(id=res.data['id'])
    assert contact.organization_id == org.id
    assert contact.created_by_id == user.id


@pytest.mark.django_db
def test_create_contact_rejects_another_organizations_customer():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    other_customer = make_customer(other_org, name='Other Customer')

    res = client.post(
        reverse('customercontact-list'),
        data={
            'customer': reverse('customer-detail', args=[other_customer.id]),
            'first_name': 'Jane',
            'last_name': 'Doe',
            'email': 'jane@acme.com',
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not CustomerContact.objects.exists()
