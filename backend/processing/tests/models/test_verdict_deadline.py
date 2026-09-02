"""
Tests for the credit case verdict deadline.

The deadline answers "how long has this case been open, and how long is left before we
are late?". Nothing about it is stored except two numbers - the organization's default
day count and an optional per-case override - so every test here is really checking that
the derived values stay correct as those two inputs and the clock move around.

See `CreditCase.verdict_due_at` and the properties beneath it.
"""

from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from customers.models import Customer
from identity.models import Organization
from processing.models import CreditCase


def make_org(name='Acme', domain='acme.com', default_verdict_days=5):
    return Organization.objects.create(
        name=name,
        email_domain=domain,
        default_verdict_days=default_verdict_days,
    )


def make_case(org, verdict_due_days=None, created_days_ago=0, verdict_at=None):
    """
    Create a credit case with its clock wound back by `created_days_ago` days.

    `created_at` is an auto_now_add field, so Django overwrites whatever we pass on
    create. A queryset .update() writes the column directly and skips that, which is the
    only way to test a case that is several days old without waiting several days.
    """
    customer = Customer.objects.create(organization=org, name='Some Customer')
    case = CreditCase.objects.create(customer=customer, verdict_due_days=verdict_due_days)

    CreditCase.objects.filter(pk=case.pk).update(
        created_at=timezone.now() - timedelta(days=created_days_ago),
        verdict_at=verdict_at,
    )
    case.refresh_from_db()
    return case


@pytest.mark.django_db
def test_case_without_an_override_uses_the_organization_default():
    """The normal case: nobody sets anything per case, so the org's number applies."""
    org = make_org(default_verdict_days=7)
    case = make_case(org)

    assert case.verdict_due_days is None  # no override stored
    assert case.verdict_due_days_effective == 7


@pytest.mark.django_db
def test_per_case_override_beats_the_organization_default():
    org = make_org(default_verdict_days=5)
    case = make_case(org, verdict_due_days=30)

    assert case.verdict_due_days_effective == 30


@pytest.mark.django_db
def test_verdict_due_at_is_counted_from_created_at():
    """The clock starts when the case is created, not when it is submitted."""
    org = make_org(default_verdict_days=5)
    case = make_case(org)

    assert case.verdict_due_at == case.created_at + timedelta(days=5)


@pytest.mark.django_db
def test_days_since_created_counts_days_passed():
    org = make_org(default_verdict_days=5)
    case = make_case(org, created_days_ago=3)

    assert case.days_since_created == 3


@pytest.mark.django_db
def test_days_until_verdict_due_counts_days_remaining():
    # Created 2 days ago with 5 days allowed -> 3 days left.
    org = make_org(default_verdict_days=5)
    case = make_case(org, created_days_ago=2)

    assert case.days_until_verdict_due == 3
    assert case.is_verdict_overdue is False


@pytest.mark.django_db
def test_days_until_verdict_due_is_zero_on_the_due_date():
    """Due today reads as 0, not 1 and not -1 - the boundary people get wrong."""
    org = make_org(default_verdict_days=5)
    case = make_case(org, created_days_ago=5)

    assert case.days_until_verdict_due == 0
    assert case.is_verdict_overdue is False


@pytest.mark.django_db
def test_days_until_verdict_due_goes_negative_once_overdue():
    """
    A late case reports a NEGATIVE number of days left rather than clamping at zero, so
    one field can express both "2 days left" and "3 days late".
    """
    org = make_org(default_verdict_days=5)
    case = make_case(org, created_days_ago=8)

    assert case.days_until_verdict_due == -3
    assert case.is_verdict_overdue is True


@pytest.mark.django_db
def test_a_decided_case_stops_its_clock_at_the_verdict():
    """
    A case decided inside its deadline must not drift into "overdue" just because time
    keeps passing. Created 10 days ago with 5 days allowed, but decided on day 2.
    """
    org = make_org(default_verdict_days=5)
    decided_on = timezone.now() - timedelta(days=8)
    case = make_case(org, created_days_ago=10, verdict_at=decided_on)

    # Measured against verdict_at, not now: 2 days to decide, 3 days to spare.
    assert case.days_since_created == 2
    assert case.days_until_verdict_due == 3
    assert case.is_verdict_overdue is False


@pytest.mark.django_db
def test_a_case_decided_late_stays_flagged_as_overdue():
    """The mirror of the test above: a genuinely late decision keeps its late record."""
    org = make_org(default_verdict_days=5)
    case = make_case(
        org,
        created_days_ago=20,
        verdict_at=timezone.now() - timedelta(days=13),  # decided on day 7
    )

    assert case.days_since_created == 7
    assert case.days_until_verdict_due == -2
    assert case.is_verdict_overdue is True


@pytest.mark.django_db
def test_changing_the_organization_default_moves_existing_case_deadlines():
    """
    Documents the accepted trade-off of computing the deadline instead of storing it:
    an organization that changes its default changes it for cases that already exist.
    """
    org = make_org(default_verdict_days=5)
    case = make_case(org, created_days_ago=6)
    assert case.is_verdict_overdue is True

    org.default_verdict_days = 10
    org.save()
    case.refresh_from_db()

    assert case.verdict_due_days_effective == 10
    assert case.is_verdict_overdue is False


@pytest.mark.django_db
def test_organization_default_verdict_days_must_be_at_least_one():
    """
    Zero days would mean every case is overdue the moment it is created. Organization.save()
    runs full_clean(), so the validator is enforced on an ordinary save.
    """
    with pytest.raises(ValidationError):
        make_org(default_verdict_days=0)


@pytest.mark.django_db
def test_case_override_must_be_at_least_one():
    """
    CreditCase.save() does not run full_clean(), so this validator protects the API layer
    (DRF serializers do run field validators) rather than raw ORM writes.
    """
    org = make_org()
    case = make_case(org, verdict_due_days=1)
    case.verdict_due_days = 0

    with pytest.raises(ValidationError):
        case.full_clean()
