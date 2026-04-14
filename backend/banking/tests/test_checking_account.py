from django.db.utils import IntegrityError
from django.test import TestCase

from banking.models import (
    CheckingAccount
)
from core.tests.obj_instances_global import (
    test_create_account_inst,
)
from core.tests.constants_global import(
    TEST_CHECKING_ACCOUNT_DATA,
)


class TestCheckingAccountModel(TestCase):
    """ Tests for the CheckingAccount model. """

    chk_acct_data = TEST_CHECKING_ACCOUNT_DATA

    # test create checking acct success
    def test_create_checking_account(self):
        # create acct first, then checking acct
        acct = test_create_account_inst()
        checking_acct = CheckingAccount.objects.create(
            account=acct,  # acct obj, not its pk/id
            **self.chk_acct_data,
        )
        self.assertIsInstance(checking_acct, CheckingAccount)
        self.assertEqual(checking_acct.account, acct)
        self.assertEqual(
            checking_acct.debit_card_number,
            self.chk_acct_data['debit_card_number'],
        )
        self.assertEqual(
            checking_acct.debit_card_expiration_date,
            self.chk_acct_data['debit_card_expiration_date'],
        )

    # test one2one relation to base acct is required
    def test_checking_acct_relation_to_acct(self):
        with self.assertRaises(IntegrityError):
            CheckingAccount.objects.create(
                **self.chk_acct_data,  # missing Account instance
            )
