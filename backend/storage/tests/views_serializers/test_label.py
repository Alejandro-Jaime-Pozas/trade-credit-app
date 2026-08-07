"""
API tests for Label (custom field definitions) and LabelValue (their per-object
values). Covers: creating a Label scoped to a specific model, rejecting a
non-allowlisted content type, "set a value" behaving like a real field (update
in place instead of erroring on a second POST), tenant isolation, the
`existing-values` reuse action, and `custom_fields` showing up on CreditCase.
"""

import pytest
from django.contrib.contenttypes.models import ContentType
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer
from identity.models import Organization, User
from processing.models import CreditCase
from storage.models import Label, LabelValue


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


def make_credit_case(customer):
    return CreditCase.objects.create(customer=customer)


@pytest.mark.django_db
def test_create_label_scoped_to_creditcase():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)

    res = client.post(
        reverse('label-list'),
        data={'name': 'sucursal', 'content_type': 'creditcase'},
    )

    assert res.status_code == status.HTTP_201_CREATED
    label = Label.objects.get(id=res.data['id'])
    assert label.name == 'sucursal'
    assert label.content_type.model == 'creditcase'
    assert label.organization == org  # auto-set from the requesting user, like Customer


@pytest.mark.django_db
def test_create_label_rejects_non_allowlisted_content_type():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)

    # 'user' is a real Django model but not one of the app's labelable models.
    res = client.post(
        reverse('label-list'),
        data={'name': 'sucursal', 'content_type': 'user'},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_setting_label_value_twice_updates_in_place():
    """Setting the same label on the same object twice should behave like a field: update, not duplicate."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    credit_case = make_credit_case(customer)

    label = Label.objects.create(
        organization=org,
        name='sucursal',
        content_type=ContentType.objects.get(model='creditcase'),
    )
    label_url = reverse('label-detail', args=[label.id])

    first = client.post(
        reverse('labelvalue-list'),
        data={'label': label_url, 'object_id': credit_case.id, 'value': 'MTY Norte'},
    )
    assert first.status_code == status.HTTP_201_CREATED

    second = client.post(
        reverse('labelvalue-list'),
        data={'label': label_url, 'object_id': credit_case.id, 'value': 'MTY Sur'},
    )
    assert second.status_code == status.HTTP_200_OK

    # Still only one row, holding the latest value.
    assert LabelValue.objects.filter(label=label, object_id=credit_case.id).count() == 1
    assert LabelValue.objects.get(label=label, object_id=credit_case.id).value == 'MTY Sur'


@pytest.mark.django_db
def test_label_value_rejects_target_in_another_organization():
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)

    label = Label.objects.create(
        organization=org, name='sucursal', content_type=ContentType.objects.get(model='creditcase'),
    )
    other_customer = make_customer(other_org, name='Other Customer')
    other_credit_case = make_credit_case(other_customer)

    res = client.post(
        reverse('labelvalue-list'),
        data={
            'label': reverse('label-detail', args=[label.id]),
            'object_id': other_credit_case.id,
            'value': 'MTY Norte',
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_label_value_rejects_using_another_organizations_label():
    """
    Regression test: a user must not be able to attach ANOTHER organization's
    label to one of their OWN objects. Before the fix, validate() only checked
    that the target object was reachable via *a* org the user belongs to — it
    never checked that the label itself belonged to that user's organization,
    so a user could pick another org's label (e.g. from the create-form
    dropdown) and attach it to their own CreditCase.
    """
    org = make_org('Acme', 'acme.com')
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)

    # The label belongs to a DIFFERENT organization than the requesting user.
    other_org_label = Label.objects.create(
        organization=other_org, name='sucursal', content_type=ContentType.objects.get(model='creditcase'),
    )
    # The target CreditCase belongs to the user's OWN organization.
    own_customer = make_customer(org)
    own_credit_case = make_credit_case(own_customer)

    res = client.post(
        reverse('labelvalue-list'),
        data={
            'label': reverse('label-detail', args=[other_org_label.id]),
            'object_id': own_credit_case.id,
            'value': 'HIJACKED',
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert not LabelValue.objects.filter(object_id=own_credit_case.id).exists()


@pytest.mark.django_db
def test_label_value_rejects_nonexistent_object_id():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    label = Label.objects.create(
        organization=org, name='sucursal', content_type=ContentType.objects.get(model='creditcase'),
    )

    res = client.post(
        reverse('labelvalue-list'),
        data={'label': reverse('label-detail', args=[label.id]), 'object_id': 999999, 'value': 'MTY Norte'},
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_custom_fields_appears_on_credit_case_detail():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    credit_case = make_credit_case(customer)
    label = Label.objects.create(
        organization=org, name='sucursal', content_type=ContentType.objects.get(model='creditcase'),
    )
    LabelValue.objects.create(
        label=label,
        content_type=ContentType.objects.get(model='creditcase'),
        object_id=credit_case.id,
        value='MTY Norte',
    )

    res = client.get(reverse('creditcase-detail', args=[credit_case.id]))

    assert res.status_code == status.HTTP_200_OK
    assert res.data['custom_fields'] == {'sucursal': 'MTY Norte'}


@pytest.mark.django_db
def test_existing_values_action_returns_distinct_values():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    credit_case_a = make_credit_case(customer)
    credit_case_b = make_credit_case(customer)
    label = Label.objects.create(
        organization=org, name='sucursal', content_type=ContentType.objects.get(model='creditcase'),
    )
    credit_case_ct = ContentType.objects.get(model='creditcase')
    LabelValue.objects.create(label=label, content_type=credit_case_ct, object_id=credit_case_a.id, value='MTY Norte')
    LabelValue.objects.create(label=label, content_type=credit_case_ct, object_id=credit_case_b.id, value='MTY Sur')

    res = client.get(reverse('label-existing-values', args=[label.id]))

    assert res.status_code == status.HTTP_200_OK
    assert res.data == ['MTY Norte', 'MTY Sur']
