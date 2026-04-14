""" Score each of the variables according to weights. """

from .tier_mappings import (
    DEBT_SERVICE_COVERAGE_RATIO as dscr,
    RESIDUAL_VOLATILITY as res_volatility,
    WORST_MONTH_COVERAGE_RATIO as worst_month,
    GROWTH_TREND_PERCENT_PER_MONTH as growth_trend_pct,
)


def score_dscr(n: float) -> float:
    for res, score in dscr.items():
        if n >= res:
            return score
    raise ValueError('Must include a number.')


def score_residual_volatility(n: float) -> float:
    for res, score in res_volatility.items():
        if abs(n) <= res:
            return score
    raise ValueError('Must include a number.')


def score_worst_month_coverage_ratio(n: float) -> float:
    for res, score in worst_month.items():
        if n >= res:
            return score
    raise ValueError('Must include a number.')


def score_growth_trend_percent_per_month(n: float) -> float:
    for res, score in growth_trend_pct.items():
        if n >= res:
            return score
    raise ValueError('Must include a number.')
