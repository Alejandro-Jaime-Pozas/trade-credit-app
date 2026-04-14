from django.db.utils import IntegrityError
from django.test import TestCase

from identity.models import Company, User

from core.tests.obj_instances_global import (
    test_create_company_with_user_inst,
    test_create_user_inst,
)
from core.tests.constants_global import(
    TEST_COMPANY_DATA,
)


class TestCompanyModel(TestCase):
    """ Test Company model and its field constraints. """

    company_data = TEST_COMPANY_DATA

    # test create company, user is linked
    # TIP: user is m2m, so relation is not enforced, no need to check for null relations
    def test_create_company_with_user(self):
        c = Company.objects.create(**self.company_data)
        user = test_create_user_inst()
        c.users.add(user)
        self.assertIsInstance(c, Company)
        self.assertEqual(c.users.first(), user)
        self.assertEqual(c.name, self.company_data['name'])
        self.assertEqual(c.email_domain, self.company_data['email_domain'])

    # test email_domain is unique
    def test_company_domain_is_unique(self):
        c1 = test_create_company_with_user_inst()

        with self.assertRaises(IntegrityError):
            c2 = test_create_company_with_user_inst()

    # test name is not null
    def test_company_name_not_null(self):
        with self.assertRaises(IntegrityError):
            company_data = self.company_data.copy()
            company_data['name'] = None
            Company.objects.create(
                **company_data,
            )

    # test create company for given user (using user email)
    def test_create_company_with_user_for_user(self):
        user = test_create_user_inst()
        def_company_fields = TEST_COMPANY_DATA.copy()
        exclude = ('name', 'email_domain')
        def_company_fields = {k: v for k, v in def_company_fields.items() if k not in exclude}
        company, created = Company.objects._get_or_create_from_user(
            user,
            **def_company_fields
        )
        # fn returns company obj
        self.assertIsInstance(company, Company)
        # company is created, not fetched
        self.assertTrue(created)
        # company is linked to the user
        self.assertEqual(user.companies.get(pk=company.pk), company)
        # company email_domain is in user email
        self.assertIn(company.email_domain, user.email)
        # company name is in user email
        self.assertIn(company.name.lower(), user.email.lower())

    # Opt: test get company for given user

    # test email_domain is not valid
    def test_invalid_email_domain_error(self):
        with self.assertRaises(ValueError):
            user = User.objects.create_user(email='def')  # error prob here
            Company.objects._get_or_create_from_user(
                user=user,
            )

