from django.db import models


class CurrencyName(models.TextChoices):
    """ Final verdict after human review: approved or rejected. """
    MXN = 'MXN', 'MXN'
