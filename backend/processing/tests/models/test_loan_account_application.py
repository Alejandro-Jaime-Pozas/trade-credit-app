from django.db.utils import IntegrityError
from django.test import TestCase


from core.tests.obj_instances_global import (
    test_create_account_application_inst,
)
from core.tests.constants_global import (
    TEST_LOAN_ACCOUNT_APPLICATION_DATA,
)
from processing.models import LoanAccountApplication


class TestLoanApplicationAccount(TestCase):
    """ Test the LoanApplicationAccount model. """

    loan_acct_app_data = TEST_LOAN_ACCOUNT_APPLICATION_DATA

    # test create loan app acct
    def test_create_loan_account_application(self):
        acct_app = test_create_account_application_inst()
        loan_acct_app = LoanAccountApplication.objects.create(
            account_application=acct_app,
            **self.loan_acct_app_data,
        )

        self.assertIsInstance(loan_acct_app, LoanAccountApplication)
        self.assertEqual(
            loan_acct_app.annual_revenue_ttm,
            self.loan_acct_app_data['annual_revenue_ttm'],
        )
        self.assertEqual(
            loan_acct_app.annual_expenses_ttm,
            self.loan_acct_app_data['annual_expenses_ttm'],
        )
        self.assertEqual(loan_acct_app.account_application, acct_app)

    # test fk to account_application required
    def test_fk_to_account_application_required(self):
        with self.assertRaises(IntegrityError):
            LoanAccountApplication.objects.create(
                **self.loan_acct_app_data,
            )
