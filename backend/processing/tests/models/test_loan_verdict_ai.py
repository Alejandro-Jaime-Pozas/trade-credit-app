from django.db import IntegrityError
from django.test import TestCase
from django.forms.models import model_to_dict

from core.tests.obj_instances_global import (
    test_create_loan_account_application_inst,
)
from core.tests.constants_global import (
    TEST_LOAN_VERDICT_AI_DATA,
)
from processing.models import (
    LoanVerdictAI,
)


class TestLoanVerdictAI(TestCase):
    """ Test the LoanVerdictAI model. """

    def setUp(self):
        self.loan_verdict_data = TEST_LOAN_VERDICT_AI_DATA.copy()
        self.loan_acct_app = test_create_loan_account_application_inst()

    # test create loan verdict ai
    def test_create_loan_verdict_ai(self):
        loan_verdict = LoanVerdictAI.objects.create(
            loan_account_application=self.loan_acct_app,
            **self.loan_verdict_data,
        )

        self.assertIsInstance(loan_verdict, LoanVerdictAI)
        self.assertEqual(
            model_to_dict(loan_verdict, fields=self.loan_verdict_data.keys()),
            self.loan_verdict_data,
        )

    # test fk to loan acct app required
    def test_loan_acct_app_fk_required(self):
        with self.assertRaises(IntegrityError):
            LoanVerdictAI.objects.create(
                **self.loan_verdict_data
            )
