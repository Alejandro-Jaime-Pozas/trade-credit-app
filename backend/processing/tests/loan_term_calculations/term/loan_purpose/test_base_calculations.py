from django.test import SimpleTestCase

from processing.loan_term_calculations.term.loan_purpose.base_calculations import get_loan_purpose_max_term
from processing.loan_term_calculations.constants import LOAN_PURPOSE_MAPPING


class TestCalculations(SimpleTestCase):

    def test_get_loan_purpose_max_term(self):
        loan_purpose = 'working_capital'

        max_term = get_loan_purpose_max_term(
            loan_purpose=loan_purpose,
        )

        self.assertEqual(max_term, LOAN_PURPOSE_MAPPING[loan_purpose]['max'])
