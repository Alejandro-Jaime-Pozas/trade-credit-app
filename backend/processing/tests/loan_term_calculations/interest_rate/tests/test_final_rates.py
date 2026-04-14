from django.test import SimpleTestCase

from processing.loan_term_calculations.interest_rate.final_rates import (
    get_risk_premium_rate,
)


class TestScores(SimpleTestCase):

    def test_get_risk_prem_rate(self):
        risk_prem_rate = get_risk_premium_rate(
            rpmt_cap_score=65,
            credit_score=35,
            collateral_score=50,
            loan_str_score=10,
            busn_qlty_score=25,
        )
        self.assertEqual(risk_prem_rate, 0.05)
