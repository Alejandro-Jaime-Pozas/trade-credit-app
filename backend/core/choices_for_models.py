from django.db import models


class CurrencyName(models.TextChoices):
    """
    Currencies a credit line can be requested in.

    The app's users are Mexican companies, so MXN is the default and by far the common
    case. USD is offered because trade credit to a Mexican importer is routinely
    denominated in dollars, and the amount is meaningless without knowing which of the
    two it is.

    Stored as the ISO 4217 code so the frontend can hand it straight to
    `Intl.NumberFormat` and get correct symbol placement for free.
    """

    MXN = 'MXN', 'MXN'
    USD = 'USD', 'USD'
