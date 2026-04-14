import math

# TODO still missing trend implementation...if cashflow growing, shrinking, etc
# TODO later add worst-month coverage for better results

# BASIC FUNCTIONS

def get_avg_monthly_cashflow(cashflow_series: list[float] = []) -> float:

    n = len(cashflow_series)
    if n < 3:
        raise ValueError("At least 3 months are required for cashflow.")

    mean = sum(cashflow_series) / n

    return mean


def get_median_value(values: list[float] = []) -> float:

    n = len(values)
    if n < 3:
        raise ValueError("At least 3 months are required for cashflow.")

    # sort the values ascending
    sorted_values = sorted(values)
    mid = n // 2

    # if values odd, get the middle value of sorted values
    if n % 2 != 0:
        median = sorted_values[(mid)]
    else:
        median = (sorted_values[mid] + sorted_values[(mid) - 1]) / 2

    return median


# DEBT SERVICE COVERAGE RATIO

def get_dscr(
    cashflow_series: list[float] = [],
    monthly_debt_payments: list[float] = [],
) -> float:
    """
    Get the debt service coverage ratio.

    Requires total existing monthly debt payments and average monthly cashflow.

    Best to use average vs median since all net cashflows are important.
    """

    # Raise error if no cashflow_series inputs
    if not cashflow_series:
        raise ValueError(f'cashflow_series must not be empty.')
    # If no monthly payments, they have no debt burden, return 100
    if not monthly_debt_payments:
        return 100

    mean = get_avg_monthly_cashflow(cashflow_series)

    return mean / sum(monthly_debt_payments)


# VOLATILITY

def get_residual_volatility(
    cashflow_series: list[float],
    inflow_series: list[float],
    outflow_series: list[float],
    *,
    base_mode: str = "gross_sum",   # "gross_sum" or "gross_avg"
    robust_base: bool = True,       # median vs mean
    epsilon: float = 1e-9,
) -> float:
    """
    Trend-adjusted volatility using regression residuals, scaled by underlying activity.

    Why this is better:
      - Residuals are still on net cash flow (good).
      - Volatility is expressed relative to a base flow level (inflows/outflows),
        so a small net number does not automatically look "volatile" when the business
        actually has large inflows/outflows.

    base_mode:
      - "gross_sum": base_t = abs(inflow_t) + abs(outflow_t)
      - "gross_avg": base_t = (abs(inflow_t) + abs(outflow_t)) / 2

    Returns:
      A unitless fraction. Example: 0.05 means ~5% residual volatility
      relative to typical monthly gross flow.
    """
    n = len(cashflow_series)
    if n < 3:
        raise ValueError("At least 3 data points are required for regression-based volatility.")
    if len(inflow_series) != n or len(outflow_series) != n:
        raise ValueError("inflow_series and outflow_series must match cashflow_series length.")

    # Build base series
    if base_mode == "gross_sum":
        base_series = [abs(i) + abs(o) for i, o in zip(inflow_series, outflow_series)]
    elif base_mode == "gross_avg":
        base_series = [(abs(i) + abs(o)) / 2.0 for i, o in zip(inflow_series, outflow_series)]
    else:
        raise ValueError("base_mode must be 'gross_sum' or 'gross_avg'.")

    base_level = get_median_value(base_series) if robust_base else (sum(base_series) / n)
    if base_level < epsilon:
        raise ValueError("Base flow level too close to zero to scale volatility reliably.")

    # Regression on net cash flow
    x_values = list(range(1, n + 1))
    x_mean = sum(x_values) / n
    y_mean = sum(cashflow_series) / n  # regression should use arithmetic mean

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, cashflow_series))
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    if abs(denominator) < epsilon:
        raise ValueError("Cannot compute regression slope (denominator is zero).")

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean

    residuals = [y - (intercept + slope * x) for x, y in zip(x_values, cashflow_series)]
    sse = sum(r ** 2 for r in residuals)
    residual_std_dev = math.sqrt(sse / (n - 2))

    # Key fix: scale by base activity, not by net mean
    return residual_std_dev / base_level


def get_worst_month_coverage_ratio(
    cashflow_series: list[float] = [],
    monthly_debt_payments: list[float] = [],
) -> float:
    """
    Worst-month coverage ratio = minimum monthly cash flow / monthly debt payment.

    Example:
      - minimum cash flow month = 20,000
      - monthly debt payment = 40,000
      - worst-month coverage ratio = 0.50
    """

    monthly_debt_payments = sum(monthly_debt_payments)  # if no values, returns 0

    if len(cashflow_series) < 3:
        raise ValueError("At least 3 months are required for cashflow_series.")

    if not monthly_debt_payments or monthly_debt_payments <= 0:
        return 100

    worst_month_cashflow = min(cashflow_series)
    return worst_month_cashflow / monthly_debt_payments


def get_growth_trend_metrics(
    cashflow_series: list[float],
    inflow_series: list[float],
    outflow_series: list[float],
    *,
    base_mode: str = "gross_sum",   # "gross_sum" or "gross_avg"
    robust_base: bool = True,       # median vs mean
    epsilon: float = 1e-9
) -> dict[str, float]:
    """
    Fit a straight line to net cash flow:
        net = intercept + slope * month_index

    Returns:
      - trend_slope: currency change per month (on net cash flow)
      - trend_percent_per_month_of_base: slope / typical_base_flow
      - trend_percent_over_window_of_base: (pred_end - pred_start) / typical_base_flow

    Key fix:
      Percent metrics are scaled by inflow/outflow activity so small net values
      do not create misleadingly huge trend percentages.
    """
    n = len(cashflow_series)
    if n < 3:
        raise ValueError("At least 3 months are required to estimate a trend.")
    if len(inflow_series) != n or len(outflow_series) != n:
        raise ValueError("inflow_series and outflow_series must match cashflow_series length.")

    # Base flow per month
    if base_mode == "gross_sum":
        base_series = [abs(i) + abs(o) for i, o in zip(inflow_series, outflow_series)]
    elif base_mode == "gross_avg":
        base_series = [(abs(i) + abs(o)) / 2.0 for i, o in zip(inflow_series, outflow_series)]
    else:
        raise ValueError("base_mode must be 'gross_sum' or 'gross_avg'.")

    base_level = get_median_value(base_series) if robust_base else (sum(base_series) / n)
    if base_level < epsilon:
        raise ValueError("Base flow level too close to zero to scale trend reliably.")

    # Regression on net cash flow
    x_values = list(range(1, n + 1))
    x_mean = sum(x_values) / n
    y_mean = sum(cashflow_series) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, cashflow_series))
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    if abs(denominator) < epsilon:
        raise ValueError("Cannot compute trend slope (denominator is zero).")

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean

    pred_start = intercept + slope * 1
    pred_end = intercept + slope * n

    trend_percent_per_month_of_base = slope / base_level
    trend_percent_over_window_of_base = (pred_end - pred_start) / base_level

    return {
        "trend_slope": slope,
        "trend_percent_per_month": trend_percent_per_month_of_base,
        "trend_percent_over_window": trend_percent_over_window_of_base,
        "predicted_start_net": pred_start,
        "predicted_end_net": pred_end,
        "base_flow_level": base_level,
    }
