# 2026-02-25 rate = 7.309%

import datetime
from datetime import date


# TODO get interbank rate api to always get up-to-date rate
def get_base_rate(date: datetime.date = date.today()):
    """
    Get the latest Interbank Equilibrium Interest Rate 28-day for Bank of
    Mexico.

    Returns floate (rate).
    """

    return 0.07309
