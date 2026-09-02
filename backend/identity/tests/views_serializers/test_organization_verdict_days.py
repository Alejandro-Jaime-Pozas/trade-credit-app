"""
API tests for `Organization.default_verdict_days`.

This field is WRITABLE — an organization is meant to tune how long it gives itself to decide
a credit case. Anything writable and organization-owned needs its tenant boundary pinned, so
the important test here is the last one: a user must not be able to reach into another
organization and change how long IT gets.
"""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from identity.models import Organization, User


def make_org(name='Acme', domain='acme.com'):
    # Organization.save() runs full_clean, so the domain must be a real-looking domain.
    return Organization.objects.create(name=name, email_domain=domain)


def make_user_in_org(org, email='user@acme.com'):
    user = User.objects.create_user(email=email)
    user.organizations.add(org)
    return user


def make_client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
def test_organization_has_a_default_verdict_days_out_of_the_box():
    """A new organization gets a working deadline without anyone configuring one."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))

    res = client.get(reverse('organization-detail', args=[org.id]))

    assert res.status_code == status.HTTP_200_OK
    assert res.data['default_verdict_days'] == 5


@pytest.mark.django_db
def test_organization_can_change_its_own_default_verdict_days():
    org = make_org()
    client = make_client_for(make_user_in_org(org))

    res = client.patch(
        reverse('organization-detail', args=[org.id]),
        data={'default_verdict_days': 10},
    )

    assert res.status_code == status.HTTP_200_OK
    org.refresh_from_db()
    assert org.default_verdict_days == 10


@pytest.mark.django_db
def test_default_verdict_days_rejects_zero():
    """Zero days would make every credit case overdue the moment it is created."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))

    res = client.patch(
        reverse('organization-detail', args=[org.id]),
        data={'default_verdict_days': 0},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    org.refresh_from_db()
    assert org.default_verdict_days == 5  # unchanged


@pytest.mark.django_db
def test_user_cannot_change_another_organizations_default_verdict_days():
    """
    Tenant isolation on the newly writable field.

    A user in org A patching org B must not succeed. OrganizationViewSet.get_queryset()
    limits a non-superuser to their own organizations, so org B is not even visible — the
    request 404s rather than 403s, and org B's setting is untouched.
    """
    org_a = make_org(name='Acme', domain='acme.com')
    org_b = make_org(name='Globex', domain='globex.com')
    attacker = make_user_in_org(org_a, email='attacker@acme.com')
    client = make_client_for(attacker)

    res = client.patch(
        reverse('organization-detail', args=[org_b.id]),
        data={'default_verdict_days': 999},
    )

    assert res.status_code == status.HTTP_404_NOT_FOUND
    org_b.refresh_from_db()
    assert org_b.default_verdict_days == 5  # never touched
