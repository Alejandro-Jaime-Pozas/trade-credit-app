# Credit component
CREDIT_SCORE = {
    750: 10,
    700: 25,
    660: 45,
    600: 65,
    500: 85,
    0: 100,
}

# Cashflow component
DSCR_SCORE = {
    1.75: 10,
    1.50: 25,
    1.30: 45,
    1.15: 65,
    1.10: 85,
    float('-inf'): 100,
}

# Leverage component
DEBT_TO_REVENUE_SCORE = {
    0.20: 10,
    0.40: 30,
    0.60: 50,
    0.80: 70,
    1.00: 85,
    float('inf'): 100,
}

# Volatility component (already included in final_term.py)

# TODO Collateral component
