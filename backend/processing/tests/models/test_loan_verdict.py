from django.db import IntegrityError
from django.test import TestCase
from django.forms.models import model_to_dict

from core.tests.obj_instances_global import (
    test_create_loan_account_application_inst,
)
from core.tests.constants_global import (
    TEST_LOAN_VERDICT_DATA,
)
from processing.models import (
    LoanVerdict,
)


class TestLoanVerdict(TestCase):
    """ Test the LoanVerdict model. """

    def setUp(self):
        self.loan_verdict_data = TEST_LOAN_VERDICT_DATA.copy()
        self.loan_acct_app = test_create_loan_account_application_inst()

    # test create loan verdict
    def test_create_loan_verdict(self):
        loan_verdict = LoanVerdict.objects.create(
            loan_account_application=self.loan_acct_app,
            **self.loan_verdict_data,
        )

        self.assertIsInstance(loan_verdict, LoanVerdict)
        self.assertEqual(
            model_to_dict(loan_verdict, fields=self.loan_verdict_data.keys()),
            self.loan_verdict_data,
        )

    # test fk to loan acct app required
    def test_loan_acct_app_fk_required(self):
        with self.assertRaises(IntegrityError):
            LoanVerdict.objects.create(
                **self.loan_verdict_data
            )
