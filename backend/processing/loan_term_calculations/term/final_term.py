from processing.loan_term_calculations.constants import (
    RESIDUAL_VOLATILITY_TERM_REDUCTION,
    RISK_TIER_TERM_CAP,
)
from processing.loan_term_calculations.term.loan_purpose.base_calculations import (
    get_loan_purpose_max_term,
)

# TODO missing tests for this...
def get_final_term(
    loan_purpose: str,  # working_capital, business_expansion, etc
    # TODO whatever params required for getting risk_tier, cashflow_volatility
    cashflow_volatility: float,  # get from interest rate calculation in loan_term_handling, otherwise need cashflows
    risk_tier_map: dict = RISK_TIER_TERM_CAP,
    volatility_reduction_map: dict = RESIDUAL_VOLATILITY_TERM_REDUCTION,
):
    """
    Get the final term, given the loan purpose, risk tier, cashflow volatility.
    """

    # Get the loan purpose max term
    loan_purpose_max_term = get_loan_purpose_max_term(loan_purpose=loan_purpose)

    # Get the risk tier
    risk_tier = ...  # TODO

    # Get the risk tier max term
    risk_tier_max_term = risk_tier_map[risk_tier]

    # If risk tierm term less than loan purpose term, set max term to risk, else purpose
    if risk_tier_max_term < loan_purpose_max_term:
        post_risk_assessment_term = risk_tier_max_term
    else:
        post_risk_assessment_term = loan_purpose_max_term

    # Reduce max term if volatility not stable
    final_max_term = post_risk_assessment_term
    for num, months in volatility_reduction_map.items():
        if cashflow_volatility < num:
            final_max_term -= months
            return final_max_term

    return final_max_term  # if no volatility mapping
