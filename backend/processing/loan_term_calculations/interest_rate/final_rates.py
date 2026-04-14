""" Weighted score final risk premium interest rate. """

from processing.loan_term_calculations.interest_rate.risk_premium.scorecard.add_on_rate import (
    SCORE_ADD_ON_RATE_MAPPING as add_on_mapping,
)
from processing.loan_term_calculations.interest_rate.risk_premium.scorecard.weights import (
    RISK_PREMIUM,
)
from processing.loan_term_calculations.interest_rate.base_rate.base_calculations import (
    get_base_rate as base_rate,
)
from processing.loan_term_calculations.interest_rate.operating_margin.base_calculations import (
    get_operating_margin_rate as operating_margin_rate,
)
from processing.loan_term_calculations.interest_rate.adjustments.base_calculations import (
    get_adjustments_rate as adjustments_rate,
)


def get_risk_premium_rate(
    rpmt_cap_score: float,
    credit_score: float,
    collateral_score: float,
    loan_str_score: float,
    busn_qlty_score: float,
):
    """ Aggregates scores and returns a final risk premium rate. """

    composite_score = \
        rpmt_cap_score
        # TODO add below back later once ready!!!!!!!!!!!!!!!!!!!!!
        # rpmt_cap_score * RISK_PREMIUM['repayment_capacity'] \
        # + credit_score * RISK_PREMIUM['credit_quality'] \
        # + collateral_score * RISK_PREMIUM['collateral_and_guarantees'] \
        # + loan_str_score * RISK_PREMIUM['loan_structure'] \
        # + busn_qlty_score * RISK_PREMIUM['business_quality'] \

    for score, rate in add_on_mapping.items():
        if composite_score <= score:
            return rate


def get_base_rate():
    return base_rate()


def get_operating_margin_rate():
    return operating_margin_rate()


def get_adjustments_rate():
    return adjustments_rate()


def get_total_interest_rate(
    rpmt_cap_score: float,
    credit_score: float,
    collateral_score: float,
    loan_str_score: float,
    busn_qlty_score: float,
):

    base_rate = get_base_rate()
    operating_margin_rate = get_operating_margin_rate()
    risk_premium = get_risk_premium_rate(
        rpmt_cap_score,
        credit_score,
        collateral_score,
        loan_str_score,
        busn_qlty_score,
    )
    adjustments_rate = get_adjustments_rate()

    return \
        base_rate \
        + operating_margin_rate \
        + risk_premium \
        + adjustments_rate 

