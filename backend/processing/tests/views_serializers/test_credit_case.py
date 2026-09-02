"""
API tests for CreditCase tenant isolation.

Regression coverage for a cross-tenant write gap: `customer` and `assigned_to`
were both writable FKs with unfiltered querysets, so a user in one organization
could create a CreditCase pointing at another organization's Customer, or
assign it to a user in another organization. Fixed via
CreditCaseViewSet.organization_scoped_fields (OrganizationScopedMixin).
"""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer
from identity.models import Organization, User
from processing.models import CreditCase


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
def test_create_credit_case_for_own_customer_succeeds():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    res = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )

    assert res.status_code == status.HTTP_201_CREATED
    credit_case = CreditCase.objects.get(id=res.data['id'])
    assert credit_case.customer_id == customer.id


@pytest.mark.django_db
def test_create_credit_case_defaults_assigned_to_creating_user():
    """The frontend's create flow never sends assigned_to, so it must default to whoever created the case."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    res = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )

    assert res.status_code == status.HTTP_201_CREATED
    credit_case = CreditCase.objects.get(id=res.data['id'])
    assert credit_case.assigned_to_id == user.id


@pytest.mark.django_db
def test_create_credit_case_respects_explicit_assigned_to():
    """An explicitly-provided assigned_to (e.g. creating a case on a teammate's behalf) is not overridden."""
    org = make_org()
    creator = make_user_in_org(org, email='creator@acme.com')
    teammate = make_user_in_org(org, email='teammate@acme.com')
    client = make_client_for(creator)
    customer = make_customer(org)

    res = client.post(
        reverse('creditcase-list'),
        data={
            'customer': reverse('customer-detail', args=[customer.id]),
            'assigned_to': reverse('user-detail', args=[teammate.id]),
        },
    )

    assert res.status_code == status.HTTP_201_CREATED
    credit_case = CreditCase.objects.get(id=res.data['id'])
    assert credit_case.assigned_to_id == teammate.id


@pytest.mark.django_db
def test_reviewer_can_record_a_verdict_and_it_is_timestamped():
    """
    `verdict` used to be read-only, so the detail page could show a decision but never
    record one. It is writable now, and the serializer stamps `verdict_at` itself.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)
    assert credit_case.verdict_at is None

    res = client.patch(
        reverse('creditcase-detail', args=[credit_case.id]),
        data={'verdict': 'approved'},
    )

    assert res.status_code == status.HTTP_200_OK
    credit_case.refresh_from_db()
    assert credit_case.verdict == 'approved'
    assert credit_case.verdict_at is not None


@pytest.mark.django_db
def test_moving_a_verdict_back_to_pending_clears_the_timestamp():
    """There is no longer a decision for `verdict_at` to be the time of."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)

    detail_url = reverse('creditcase-detail', args=[credit_case.id])
    client.patch(detail_url, data={'verdict': 'rejected'})
    credit_case.refresh_from_db()
    assert credit_case.verdict_at is not None

    res = client.patch(detail_url, data={'verdict': 'pending'})

    assert res.status_code == status.HTTP_200_OK
    credit_case.refresh_from_db()
    assert credit_case.verdict == 'pending'
    assert credit_case.verdict_at is None


@pytest.mark.django_db
def test_saving_without_changing_the_verdict_keeps_the_original_timestamp():
    """Editing an unrelated field must not look like a fresh decision."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)

    detail_url = reverse('creditcase-detail', args=[credit_case.id])
    client.patch(detail_url, data={'verdict': 'approved'})
    credit_case.refresh_from_db()
    decided_at = credit_case.verdict_at

    res = client.patch(detail_url, data={'verdict': 'approved', 'requested_amount': '5000.00'})

    assert res.status_code == status.HTTP_200_OK
    credit_case.refresh_from_db()
    assert credit_case.verdict_at == decided_at


@pytest.mark.django_db
def test_create_credit_case_rejects_another_organizations_customer():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    other_customer = make_customer(other_org, name='Other Customer')

    res = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[other_customer.id])},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not CreditCase.objects.exists()


@pytest.mark.django_db
def test_create_credit_case_rejects_another_organizations_assigned_to():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    other_user = make_user_in_org(other_org, email='other@other.com')

    res = client.post(
        reverse('creditcase-list'),
        data={
            'customer': reverse('customer-detail', args=[customer.id]),
            'assigned_to': reverse('user-detail', args=[other_user.id]),
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not CreditCase.objects.exists()


# --- verdict deadline -------------------------------------------------------


@pytest.mark.django_db
def test_credit_case_detail_reports_its_verdict_deadline():
    """
    The dashboard reads these four fields directly, so they have to be on the wire, not
    just on the model.
    """
    org = make_org()
    org.default_verdict_days = 5
    org.save()
    user = make_user_in_org(org)
    client = make_client_for(user)
    case = CreditCase.objects.create(customer=make_customer(org))

    res = client.get(reverse('creditcase-detail', args=[case.id]))

    assert res.status_code == status.HTTP_200_OK
    assert res.data['verdict_due_days'] is None          # no override set
    assert res.data['verdict_due_at'] is not None
    assert res.data['days_since_created'] == 0           # created just now
    assert res.data['days_until_verdict_due'] == 5       # the org default
    assert res.data['is_verdict_overdue'] is False


@pytest.mark.django_db
def test_setting_a_per_case_override_changes_the_deadline():
    """A single case can be given more time without touching the organization default."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    case = CreditCase.objects.create(customer=make_customer(org))

    res = client.patch(
        reverse('creditcase-detail', args=[case.id]),
        data={'verdict_due_days': 30},
    )

    assert res.status_code == status.HTTP_200_OK
    assert res.data['verdict_due_days'] == 30
    assert res.data['days_until_verdict_due'] == 30
    case.refresh_from_db()
    assert case.verdict_due_days == 30


@pytest.mark.django_db
def test_verdict_due_days_override_rejects_zero():
    """
    Zero days would mean the case is overdue the moment it exists. CreditCase.save() does
    not run full_clean(), so DRF's field validation is the layer that actually stops this.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    case = CreditCase.objects.create(customer=make_customer(org))

    res = client.patch(
        reverse('creditcase-detail', args=[case.id]),
        data={'verdict_due_days': 0},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'verdict_due_days' in res.data


@pytest.mark.django_db
def test_computed_deadline_fields_are_read_only():
    """
    A client must not be able to declare its own case on time. The day count is the only
    writable part of the deadline.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    case = CreditCase.objects.create(customer=make_customer(org))

    res = client.patch(
        reverse('creditcase-detail', args=[case.id]),
        data={'is_verdict_overdue': True, 'days_until_verdict_due': 999},
    )

    # Ignored rather than rejected: DRF drops read-only fields silently.
    assert res.status_code == status.HTTP_200_OK
    assert res.data['is_verdict_overdue'] is False
    assert res.data['days_until_verdict_due'] != 999


@pytest.mark.django_db
def test_a_credit_case_can_be_requested_in_usd():
    """
    Trade credit to a Mexican importer is routinely denominated in dollars, so the
    amount is meaningless without the currency alongside it.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)

    res = client.patch(
        reverse('creditcase-detail', args=[credit_case.id]),
        data={'currency': 'USD'},
        format='json',
    )

    assert res.status_code == status.HTTP_200_OK
    credit_case.refresh_from_db()
    assert credit_case.currency == 'USD'


@pytest.mark.django_db
def test_an_unknown_currency_is_still_rejected():
    """Adding USD widens the list; it does not turn the field into free text."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)

    res = client.patch(
        reverse('creditcase-detail', args=[credit_case.id]),
        data={'currency': 'EUR'},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
