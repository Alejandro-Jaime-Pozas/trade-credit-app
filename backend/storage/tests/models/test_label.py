"""
Tests for the Label/LabelValue models: Label is a user-defined custom field
DEFINITION scoped to one model (e.g. "sucursal" for CreditCase); LabelValue is
the per-object value of that field. These tests confirm the "field-like"
guarantees at the database level: at most one value per (label, object), and
values are cascade-deleted along with the object they're attached to.
"""

import pytest
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction

from customers.models import Customer
from identity.models import Organization
from processing.models import CreditCase
from storage.models import Label, LabelValue


def make_org(domain='acme.com'):
    # Organization.save() runs full_clean, so email_domain must be a valid domain
    # (no underscores) — hence 'acme.com'.
    return Organization.objects.create(name='Acme', email_domain=domain)


def make_customer(org, name='Acme Customer'):
    return Customer.objects.create(organization=org, name=name)


def make_credit_case(customer):
    return CreditCase.objects.create(customer=customer)


def make_label(org, model_name, name='sucursal'):
    content_type = ContentType.objects.get(model=model_name)
    return Label.objects.create(organization=org, content_type=content_type, name=name)


@pytest.mark.django_db
def test_unique_value_per_label_per_object_constraint():
    """A second LabelValue for the same (label, object) must be rejected by the DB."""
    org = make_org()
    customer = make_customer(org)
    credit_case = make_credit_case(customer)
    label = make_label(org, 'creditcase')
    credit_case_ct = ContentType.objects.get_for_model(CreditCase)

    LabelValue.objects.create(
        label=label,
        content_type=credit_case_ct,
        object_id=credit_case.id,
        value='MTY Norte',
    )

    with pytest.raises(IntegrityError):
        # Use an atomic block so the IntegrityError doesn't poison the outer
        # test transaction (pytest-django wraps each test in one).
        with transaction.atomic():
            LabelValue.objects.create(
                label=label,
                content_type=credit_case_ct,
                object_id=credit_case.id,
                value='MTY Sur',
            )


@pytest.mark.django_db
def test_deleting_labeled_credit_case_cascades_label_value():
    """Deleting a CreditCase should delete its LabelValue rows too (GenericRelation)."""
    org = make_org()
    customer = make_customer(org)
    credit_case = make_credit_case(customer)
    label = make_label(org, 'creditcase')

    label_value = LabelValue.objects.create(
        label=label,
        content_type=ContentType.objects.get_for_model(CreditCase),
        object_id=credit_case.id,
        value='MTY Norte',
    )

    credit_case.delete()

    assert not LabelValue.objects.filter(id=label_value.id).exists()


@pytest.mark.django_db
def test_labels_scoped_to_different_models_are_independent():
    """
    Two Labels with the same name but scoped to different models (CreditCase vs
    Customer) are different fields entirely — each keeps its own values.
    """
    org = make_org()
    customer = make_customer(org)
    credit_case = make_credit_case(customer)

    credit_case_label = make_label(org, 'creditcase', name='sucursal')
    customer_label = make_label(org, 'customer', name='sucursal')

    LabelValue.objects.create(
        label=credit_case_label,
        content_type=ContentType.objects.get_for_model(CreditCase),
        object_id=credit_case.id,
        value='MTY Norte',
    )
    LabelValue.objects.create(
        label=customer_label,
        content_type=ContentType.objects.get_for_model(Customer),
        object_id=customer.id,
        value='MTY Sur',
    )

    assert credit_case.label_values.get().value == 'MTY Norte'
    assert customer.label_values.get().value == 'MTY Sur'
