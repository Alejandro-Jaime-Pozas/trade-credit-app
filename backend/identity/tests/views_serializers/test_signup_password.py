"""
Signup password rules.

`settings.AUTH_PASSWORD_VALIDATORS` is configured, but DRF never consults it on its own —
`UserSerializer.password` is a plain CharField, so before `validate_password()` was added
the API accepted a one-character password even though Django was configured to require
eight. These tests pin that the validators actually run on the signup endpoint.
"""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from identity.models import User


def signup(payload):
    return APIClient().post(reverse('user-list'), data=payload)


@pytest.mark.django_db
def test_signup_rejects_a_password_shorter_than_the_minimum():
    res = signup({'email': 'short@acme.com', 'password': 'Ab1!'})

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'password' in res.data
    assert not User.objects.filter(email='short@acme.com').exists()


@pytest.mark.django_db
def test_signup_rejects_an_all_numeric_password():
    res = signup({'email': 'numeric@acme.com', 'password': '99887766'})

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'password' in res.data
    assert not User.objects.filter(email='numeric@acme.com').exists()


@pytest.mark.django_db
def test_signup_rejects_a_common_password():
    res = signup({'email': 'common@acme.com', 'password': 'password'})

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'password' in res.data


@pytest.mark.django_db
def test_signup_accepts_a_strong_password():
    res = signup({'email': 'strong@acme.com', 'password': 'tr4de-Cred1t-app'})

    assert res.status_code == status.HTTP_201_CREATED
    user = User.objects.get(email='strong@acme.com')
    # Stored hashed, never in the clear, and never echoed back.
    assert user.check_password('tr4de-Cred1t-app')
    assert 'password' not in res.data
