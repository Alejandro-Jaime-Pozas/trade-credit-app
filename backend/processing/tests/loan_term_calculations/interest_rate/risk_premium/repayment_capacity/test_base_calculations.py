from django.test import SimpleTestCase

from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.base_calculations import (
    get_avg_monthly_cashflow,
    get_median_value,
    get_dscr,
    get_residual_volatility,
    get_worst_month_coverage_ratio,
    get_growth_trend_metrics,
)


class TestFormulas(SimpleTestCase):
    """ Test base calculations formulas. """

    cashflow_series = [
        70000,
        75000,
        80000,
        88000,
        95000,
        102000,
        110000,
        113000,
        115000,
        122000,
        130000,
        135000,
    ]  # do not change
    inflow_series = [
        700_000,
        750_000,
        800_000,
        880_000,
        950_000,
        1_020_000,
        1_100_000,
        1_130_000,
        1_150_000,
        1_220_000,
        1_300_000,
        1_350_000,
    ]  # do not change
    outflow_series = [
        600_000,
        700_000,
        600_000,
        800_000,
        900_000,
        1_000_000,
        1_000_000,
        1_100_000,
        1_100_000,
        1_200_000,
        1_200_000,
        1_300_000,
    ]  # do not change
    monthly_debt_payments = [
        31_000,
    ]

    def test_get_avg_monthly_cashflow(self):
        avg_mthly_cashflow = get_avg_monthly_cashflow(self.cashflow_series)
        self.assertEqual(avg_mthly_cashflow, 102916.66666666667)

    def test_get_median_value(self):
        median_value = get_median_value(self.cashflow_series)
        self.assertEqual(median_value, 106000.0)

    def test_get_dscr(self):
        dscr = get_dscr(
            cashflow_series=self.cashflow_series,
            monthly_debt_payments=self.monthly_debt_payments,
        )
        self.assertEqual(dscr, 3.3198924731182795)

    def test_get_residual_volatility(self):
        res_vlty = get_residual_volatility(
            cashflow_series=self.cashflow_series,
            inflow_series=self.inflow_series,
            outflow_series=self.outflow_series,
        )
        self.assertEqual(res_vlty, 0.00097720399933344)

    def test_get_worst_month_cvg_ratio(self):
        worst_month_ratio = get_worst_month_coverage_ratio(
            cashflow_series=self.cashflow_series,
            monthly_debt_payments=self.monthly_debt_payments,
        )
        self.assertEqual(worst_month_ratio, 2.2580645161290325)

    def test_get_growth_trend_metrics(self):
        growth_trend_metrics = get_growth_trend_metrics(
            cashflow_series=self.cashflow_series,
            inflow_series=self.inflow_series,
            outflow_series=self.outflow_series,
        )
        self.assertEqual(
            growth_trend_metrics,
            {
                'base_flow_level': 2060000.0,
                'predicted_end_net': 135628.20512820513,
                'predicted_start_net': 70205.12820512822,
                'trend_percent_over_window': 0.03175877520537714,
                'trend_percent_per_month': 0.0028871613823070134,
                'trend_slope': 5947.552447552447,
            }
        )
