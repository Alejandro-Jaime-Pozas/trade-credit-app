from processing.loan_term_calculations.term.risk_tier.scores import (
    CREDIT_SCORE,
    DEBT_TO_REVENUE_SCORE,
    DSCR_SCORE,
)
from processing.loan_term_calculations.term.risk_tier.weights import RISK_TIER


def get_credit_score(
    credit_score: int,  # actual credit score for business/owner(s)
    credict_score_map: dict = CREDIT_SCORE
):

    for c, score in credict_score_map.items():
        if credit_score > c:
            return score

    raise ValueError(f'Credit score must be integer greater than 0.')


def get_dscr_score(
    dscr: float,  # actual credit score for business/owner(s)
    dscr_score_map: dict = DSCR_SCORE,
):

    for n, score in dscr_score_map.items():
        if dscr > n:
            return score

    raise ValueError(f'dscr must be float.')


def get_debt_to_revenue_score(
    debt_to_revenue: float,  # actual credit score for business/owner(s)
    debt_to_revenue_score_map: dict = DEBT_TO_REVENUE_SCORE,
):

    for n, score in debt_to_revenue_score_map.items():
        if debt_to_revenue < n:
            return score

    raise ValueError(f'debt_to_revenue must be float.')


def get_risk_tier_score(
    credit_score: int,
    dscr: float,
    debt_to_revenue: float,
    weights: dict = RISK_TIER
):
    """
    Get the risk tier score given risk number inputs.

    Returns float (score).
    """

    cred_score = get_credit_score(credit_score)
    dscr_score = get_dscr_score(dscr)
    debt_to_revenue_score = get_debt_to_revenue_score(debt_to_revenue)

    return \
        weights['credit'] * cred_score \
        + weights['dscr'] * dscr_score \
        + weights['debt_to_revenue'] * debt_to_revenue_score
