""" Scores for each of the risk premium components. """

from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.scores import (
    score_dscr,
    score_growth_trend_percent_per_month,
    score_residual_volatility,
    score_worst_month_coverage_ratio,
)
from processing.loan_term_calculations.interest_rate.risk_premium.repayment_capacity.weights import (
    REPAYMENT_CAPACITY as rpmt_cap,
)

def score_repayment_capacity(
    dscr_res: float,
    residual_volatility_res: float,
    worst_month_coverage_res: float,
    growth_trend_percent_res: float,
):
    """
    Score the repayment capacity.

    Returns float.
    """
    dscr_score = score_dscr(dscr_res)
    res_volatility_score = score_residual_volatility(residual_volatility_res)
    worst_month_coverage_score = score_worst_month_coverage_ratio(
        worst_month_coverage_res
    )
    growth_trend_percent_score = score_growth_trend_percent_per_month(
        growth_trend_percent_res
    )

    return \
        dscr_score * rpmt_cap['dscr'] \
        + res_volatility_score * rpmt_cap['residual_volatility'] \
        + worst_month_coverage_score * rpmt_cap['worst_month_coverage_ratio'] \
        + growth_trend_percent_score * rpmt_cap['growth_trend']


def score_credit_quality():
    ...


def score_collateral_guarantees():
    ...


def score_loan_structure():
    ...


def score_business_quality():
    ...
