
PAYMENT_RATIO_AVG_CASHFLOW=0.40
TERM_MONTHS_CHOICES = (12, 18, 24, 30, 36, 48, 60, 72, 84)


# Loan purpose mapping to min/max month values
LOAN_PURPOSE_MAPPING = {
    'working_capital': {
        'min': 6,
        'max': 36,
    },
    'equipment_financing': {
        'min': 12,
        'max': 60,
    },
    'business_expansion': {
        'min': 24,
        'max': 60,
    },
    'refinancing': {
        'min': 12,
        'max': 60,
    },
}


# Risk tier term cap max months
RISK_TIER_TERM_CAP = {
    "A": 60,
    "B": 36,
    "C": 24,
    "D": 18,
}


# Credit score pass/fail mapping
CREDIT_SCORE_VERDICT={
  "high_risk": 587,
  "average_risk": 660,
  "good_risk": 697,
  "low_risk": 1000
}


# 10x reduction to number to acct for new inflows/outflows as base
RESIDUAL_VOLATILITY_TERM_REDUCTION={
    0.005: 0,
    0.015: 3,
    0.030: 6,
    0.050: 12,
    float('inf'): float('inf'),  # reject
}


# Loan metrics rejection thresholds
import operator
METRIC_CONFIG: dict[str, dict[str, object]] = {
    "dscr": {
        "threshold": 1.10,
        "comparator": operator.gt,  # value must be greater than threshold
    },
    "residual_volatility": {
        "threshold": 0.50,
        "comparator": operator.lt,  # value must be less than threshold
    },
    "worst_month_coverage_ratio": {
        "threshold": 0.75,
        "comparator": operator.gt,
    },
    "growth_trend_percent": {
        "threshold": -0.02,
        "comparator": operator.gt,
    },
    "average_net_cashflow": {
        "threshold": 0.00,
        "comparator": operator.gt,
    }
}
