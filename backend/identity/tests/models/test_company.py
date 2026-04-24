from django.db.utils import IntegrityError
from django.test import TestCase

from identity.models import Organization, User

from core.tests.obj_instances_global import (
    test_create_organization_with_user_inst,
    test_create_user_inst,
)
from core.tests.constants_global import(
    TEST_ORGANIZATION_DATA,
)


class TestOrganizationModel(TestCase):
    """ Test Organization model and its field constraints. """

    organization_data = TEST_ORGANIZATION_DATA

    # test create organization, user is linked
    # TIP: user is m2m, so relation is not enforced, no need to check for null relations
    def test_create_organization_with_user(self):
        c = Organization.objects.create(**self.organization_data)
        user = test_create_user_inst()
        c.users.add(user)
        self.assertIsInstance(c, Organization)
        self.assertEqual(c.users.first(), user)
        self.assertEqual(c.name, self.organization_data['name'])
        self.assertEqual(c.email_domain, self.organization_data['email_domain'])

    # test email_domain is unique
    def test_organization_domain_is_unique(self):
        c1 = test_create_organization_with_user_inst()

        with self.assertRaises(IntegrityError):
            c2 = test_create_organization_with_user_inst()

    # test name is not null
    def test_organization_name_not_null(self):
        with self.assertRaises(IntegrityError):
            organization_data = self.organization_data.copy()
            organization_data['name'] = None
            Organization.objects.create(
                **organization_data,
            )

    # test create organization for given user (using user email)
    def test_create_organization_with_user_for_user(self):
        user = test_create_user_inst()
        def_organization_fields = TEST_ORGANIZATION_DATA.copy()
        exclude = ('name', 'email_domain')
        def_organization_fields = {k: v for k, v in def_organization_fields.items() if k not in exclude}
        organization, created = Organization.objects._get_or_create_from_user(
            user,
            **def_organization_fields
        )
        # fn returns organization obj
        self.assertIsInstance(organization, Organization)
        # organization is created, not fetched
        self.assertTrue(created)
        # organization is linked to the user
        self.assertEqual(user.organizations.get(pk=organization.pk), organization)
        # organization email_domain is in user email
        self.assertIn(organization.email_domain, user.email)
        # organization name is in user email
        self.assertIn(organization.name.lower(), user.email.lower())

    # Opt: test get organization for given user

    # test email_domain is not valid
    def test_invalid_email_domain_error(self):
        with self.assertRaises(ValueError):
            user = User.objects.create_user(email='def')  # error prob here
            Organization.objects._get_or_create_from_user(
                user=user,
            )

