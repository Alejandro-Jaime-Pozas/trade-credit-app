
DEBT_SERVICE_COVERAGE_RATIO={
    2.00: 0,
    1.75: 10,
    1.50: 25,
    1.25: 50,  # manual review below this
    1.10: 75,  # reject below this
    float('-inf'): 100,
}

# 10x reduction to number to acct for new inflows/outflows as base
RESIDUAL_VOLATILITY={
    0.005: 0,
    0.015: 25,
    0.030: 60,  # manual review above this
    0.050: 85,  # reject above this
    float('inf'): 100,
}

WORST_MONTH_COVERAGE_RATIO = {
    1.50: 0,
    1.25: 15,
    1.00: 40,  # manual review below this
    0.85: 65,  # manual review below this
    0.75: 85,  # reject below this
    float('-inf'): 100,
}

# 10x reduction to number to acct for new inflows/outflows as base
GROWTH_TREND_PERCENT_PER_MONTH = {
    0.001: 0,        # >= +1.0% per month (very strong growth)
    0.0005: 10,      # +0.5%
    0.0001: 25,      # +0.1%
    0.0000: 40,      # flat
    -0.0005: 65,     # -0.5%  # dynamic manual review below this (if dscr too low, or if ...)
    -0.001: 85,      # -1.0%  # dynamic manual review below this
    -0.002: 99,      # -2.0%  # reject below this (24% cashflow drop per year)
    float('-inf'): 100,
}
