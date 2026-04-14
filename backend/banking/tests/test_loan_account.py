from django.db.utils import IntegrityError
from django.forms.models import model_to_dict
from django.test import TestCase

from core.date_utils import get_next_payment_date_from_interval
from banking.models import LoanAccount
from core.tests.constants_global import (
    TEST_LOAN_ACCOUNT_DATA,
)
from core.tests.obj_instances_global import (
    test_create_account_inst,
)


class TestLoanAccountModel(TestCase):
    """ Test for the loan account model. """

    @classmethod
    def setUpTestData(cls):
        cls.loan_account_data = TEST_LOAN_ACCOUNT_DATA.copy()
        cls.account = test_create_account_inst()

    # test create loan account
    def test_create_loan_account(self):
        loan_acct = LoanAccount.objects.create(
            account=self.account,
            **self.loan_account_data,
        )
        self.assertIsInstance(loan_acct, LoanAccount),
        self.assertEqual(loan_acct.account, self.account)
        self.assertEqual(loan_acct.account.number, self.account.number)
        self.assertEqual(
            model_to_dict(loan_acct, fields=self.loan_account_data.keys()),
            self.loan_account_data
        )
        # test get next payment date works correctly to set as default
        self.assertEqual(
            loan_acct.next_payment_date,
            get_next_payment_date_from_interval(
                self.loan_account_data['payment_interval']
            )
        )

    # test FK to account required
    def test_fk_to_account_required(self):
        with self.assertRaises(IntegrityError):
            LoanAccount.objects.create(
                **self.loan_account_data,
            )
