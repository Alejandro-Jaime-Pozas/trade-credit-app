from django.test import SimpleTestCase

from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.scores import (
    score_dscr,
    score_residual_volatility,
    score_worst_month_coverage_ratio,
    score_growth_trend_percent_per_month,
)


class TestScores(SimpleTestCase):

    def test_score_dscr(self):
        score = score_dscr(1.5)
        self.assertEqual(score, 25)

    def test_score_residual_volatility(self):
        score = score_residual_volatility(0.020)
        self.assertEqual(score, 60)

    def test_score_worst_month_coverage_ratio(self):
        score = score_worst_month_coverage_ratio(1.00)
        self.assertEqual(score, 40)

    def test_score_growth_trend_percent_per_month(self):
        score = score_growth_trend_percent_per_month(-0.0003)
        self.assertEqual(score, 65)
