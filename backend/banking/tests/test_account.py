from django.db.utils import IntegrityError
from django.test import TestCase

from banking.constants import (
    ACCOUNT_NUMBER_LENGTH,
    CLABE_NUMBER_LENGTH,
)
from core.tests.obj_instances_global import (
    test_create_account_application_inst,
    test_create_user_inst_with_company,
)
from core.tests.constants_global import (
    TEST_ACCOUNT_DATA,
)
from core.str_utils import (
    clean_account_name,
)
from banking.models import Account

class TestAccountModel(TestCase):
    """Tests for the Account model."""

    acct_data = TEST_ACCOUNT_DATA.copy()

    # test create account
    def test_create_account(self):
        acct_app = test_create_account_application_inst()
        user = acct_app.users.first()
        acct = Account.objects.create(
            account_application=acct_app,
            **self.acct_data,
        )
        acct.users.add(user)  # user with company. don't remove, since acct can have many users while acct_app prob just one for the application process..

        self.assertIsInstance(acct, Account)
        self.assertEqual(acct.number, self.acct_data['number'])
        self.assertEqual(len(acct.number), ACCOUNT_NUMBER_LENGTH)
        self.assertEqual(len(acct.clabe), CLABE_NUMBER_LENGTH)
        self.assertEqual(acct.type, self.acct_data['type'])
        self.assertEqual(acct.users.get(id=user.id), user)

        # check name automation works
        self.assertEqual(acct.name, clean_account_name(type_name=self.acct_data['type']))

    # test fk to acct app is required
    def test_fk_to_account_application_required(self):
        with self.assertRaises(IntegrityError):
            Account.objects.create(
                **self.acct_data,
            )

    # Opt: test acct number is unique, not null, clabe is unique, can be null..perhaps better in serializer tests
