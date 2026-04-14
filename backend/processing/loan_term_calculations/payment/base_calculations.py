""" Calculations for loan payment. """


from processing.loan_term_calculations.constants import PAYMENT_RATIO_AVG_CASHFLOW
from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.base_calculations import get_avg_monthly_cashflow


# TODO later improve the payment_ratio by adjusting based on customer default risk
def get_payment(
    cashflow_series: list[float],
    payment_ratio: float = PAYMENT_RATIO_AVG_CASHFLOW
):

    avg_monthly_cashflow = get_avg_monthly_cashflow(cashflow_series)

    return payment_ratio * avg_monthly_cashflow
