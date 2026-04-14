from datetime import datetime, timedelta, date
from dateutil.relativedelta import relativedelta
import calendar

from django.utils import timezone

from banking.constants import DEBIT_CARD_EXPIRATION_YEARS


# Get the current date MOCK FOR NOW SINCE WILL TEST OUT
def get_current_date():
    # return timezone.now().date()
    return date(2024, 1, 1)


def get_default_debit_card_expiration_date():
    return get_month_end_date_for_x_yrs_in_future(DEBIT_CARD_EXPIRATION_YEARS)


# Get the last day of the month X years in the future
def get_month_end_date_for_x_yrs_in_future(n_years: int) -> datetime:
    """ Gets the last day of the month in X years from today's date. """
    today = datetime.now()

    # Step 1: Add n years
    future = today.replace(year=today.year + n_years)

    # Step 2: Get last day of the future date's month
    last_day = calendar.monthrange(future.year, future.month)[1]

    # Step 3: Return the date adjusted to the last day of the month
    future_last_day = future.replace(day=last_day)

    return future_last_day


# Get the next payment date depending on input
def get_next_payment_date_from_interval(interval: str) -> datetime.date:
    """
    Currently using datetime.now().date() as start date,
    later change to real loan start date.
    """
    today = datetime.now().date()

    if interval == 'daily':
        return today + timedelta(days=1)
    if interval == 'weekly':
        return today + timedelta(weeks=1)
    if interval == 'monthly':
        return today + relativedelta(months=1)
    if interval == 'quarterly':
        return today + relativedelta(months=3)
    if interval == 'yearly':
        return today + relativedelta(years=1)

    return today  # fallback
