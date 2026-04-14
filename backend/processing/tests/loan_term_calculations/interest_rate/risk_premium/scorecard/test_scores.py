from django.test import SimpleTestCase

from processing.loan_term_calculations.interest_rate.risk_premium.scorecard.scores import (
    score_repayment_capacity,
)


class TestScores(SimpleTestCase):

    def test_score_repayment_capacity(self):
        rpmt_cap_score = score_repayment_capacity(
            dscr_res=1.10,
            residual_volatility_res=0.20,
            worst_month_coverage_res=0.90,
            growth_trend_percent_res=0.05,
        )
        self.assertEqual(rpmt_cap_score, 70.0)
