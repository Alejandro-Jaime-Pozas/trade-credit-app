"""
The browsable API (DRF's HTML interface) must render for every endpoint.

Regression coverage for a 500 that took out most of the API UI: `NamedHyperlinkedRelatedField`
represents a relation as a dict (`{"url": ..., "display": ...}`), but DRF's
`RelatedField.get_choices()` uses that representation as a DICT KEY when building the
`<select>` options for the HTML forms. A dict is unhashable, so rendering any form
containing one of those fields died with `TypeError: unhashable type: 'dict'`.

JSON was never affected — it doesn't build forms — which is why the API kept working for
the frontend while the browsable UI was broken.
"""

import pytest
from django.urls import reverse
from rest_framework import relations, status
from rest_framework.test import APIClient, APIRequestFactory

from customers.models import Customer
from customers.serializers import CustomerContactSerializer
from identity.models import Organization, User


def make_org(name='Acme', domain='acme.com'):
    return Organization.objects.create(name=name, email_domain=domain)


def make_client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_user_in_org(org, email='user@acme.com'):
    user = User.objects.create_user(email=email)
    user.organizations.add(org)
    return user


# The list routes registered on the API. The browsable renderer builds a POST form for
# each of these, which is the code path that used to blow up.
LIST_ROUTE_NAMES = [
    'creditcase-list',
    'customer-list',
    'customercontact-list',
    'uploaddocument-list',
    'filetype-list',
    'label-list',
    'labelvalue-list',
    'organization-list',
    'requirementtemplate-list',
    'creditcaserequirement-list',
    'user-list',
]


@pytest.mark.django_db
@pytest.mark.parametrize('route_name', LIST_ROUTE_NAMES)
def test_browsable_api_renders_every_list_endpoint(route_name):
    org = make_org()
    user = make_user_in_org(org)
    # Some rows to populate the relation dropdowns — an empty queryset would render
    # fine even with the bug, since there would be no choices to key.
    Customer.objects.create(organization=org, name='Acme Customer')
    client = make_client_for(user)

    res = client.get(reverse(route_name), HTTP_ACCEPT='text/html')

    assert res.status_code == status.HTTP_200_OK
    res.render()


@pytest.mark.django_db
def test_related_field_choices_are_keyed_by_a_hashable_url():
    """
    The specific defect, pinned at the field level.

    DRF's own implementation is called directly here to show it still fails on this
    field — the override is doing the work, not some incidental change elsewhere.
    """
    org = make_org()
    Customer.objects.create(organization=org, name='Acme Customer')

    request = APIRequestFactory().get('/api/v1/customer-contacts/')
    field = CustomerContactSerializer(context={'request': request}).fields['customer']

    with pytest.raises(TypeError, match='unhashable type'):
        relations.RelatedField.get_choices(field)

    choices = field.get_choices()
    assert choices
    for key, label in choices.items():
        # The key is what the HTML form submits back, and `to_internal_value` expects a
        # URL string — so it must be one, not the dict the read representation uses.
        assert isinstance(key, str)
        assert key.startswith('http')
        assert isinstance(label, str)


@pytest.mark.django_db
def test_choices_keys_round_trip_through_to_internal_value():
    """An option the form offers must be a value the same field will accept back."""
    org = make_org()
    customer = Customer.objects.create(organization=org, name='Acme Customer')

    request = APIRequestFactory().get('/api/v1/customer-contacts/')
    field = CustomerContactSerializer(context={'request': request}).fields['customer']

    key = next(iter(field.get_choices()))

    assert field.to_internal_value(key) == customer


@pytest.mark.django_db
def test_json_representation_still_carries_url_and_display():
    """The dict representation is the whole point of the field — it must be untouched."""
    org = make_org()
    user = make_user_in_org(org)
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    client = make_client_for(user)

    res = client.get(reverse('customer-detail', args=[customer.id]))

    assert res.status_code == status.HTTP_200_OK
    assert set(res.data['organization']) == {'url', 'display'}
    assert res.data['organization']['display'] == 'Acme'
