from django.core.exceptions import ValidationError
from django.test import TestCase

from core.tests.obj_instances_global import (
    test_create_organization_with_user_inst,
)
from core.tests.constants_global import (
    TEST_USER_DATA,
)

from identity.models import User


# test user field constraints
class TestUserModel(TestCase):
    """ Test User model and its field constraints. """

    user_data = TEST_USER_DATA

    # test create user, email = username, organization = default organization
    # TIP: organization is m2m, so relation is not enforced, no need to check for null relations
    def testtest_create_user_inst(self):
        organization = test_create_organization_with_user_inst()
        user = User.objects.create_user(
            **self.user_data
        )
        user.organizations.add(organization)
        user_organization = user.organizations.get(id=organization.id)
        self.assertIsInstance(user, User)
        self.assertEqual(user.email, self.user_data['email'])
        self.assertEqual(user.email, user.username)
        self.assertEqual(user_organization, organization)

    # test user email field must be included to create user
    def test_user_email_required(self):
        with self.assertRaises(TypeError):
            User.objects.create_user()

    # test user email cannot be null-type
    def test_user_email_not_null_type(self):
        null_emails = (None, '')
        for e in null_emails:
            with self.assertRaises(ValidationError):
                User.objects.create_user(email=e)

    # test super_user must have certain fields
    def test_super_user_fields(self):
        fields = ('is_staff', 'is_superuser')
        for f in fields:
            with self.assertRaises(ValueError):
                User.objects.create_superuser(
                    **self.user_data,
                    **{f: False},  # field must be True
                )
