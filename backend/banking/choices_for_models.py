from django.db import models


# models.TextChoices allows (db value, django display label) to include in a model's fields
class AccountType(models.TextChoices):
    """ Specify bank account type. Checking, loan, etc."""
    CHECKING = 'checking', 'Checking'
    LOAN = 'loan', 'Loan'


class LoanPaymentType(models.TextChoices):
    """ Loan payment type can be variable or fixed. """
    FIXED = 'fixed', 'Fixed'
    VARIABLE = 'variable', 'Variable'


class PaymentInterval(models.TextChoices):
    """ The payment interval: monthly, yearly, etc. """
    DAILY = 'daily', 'Daily'
    WEEKLY = 'weekly', 'Weekly'
    MONTHLY = 'monthly', 'Monthly'
    QUARTERLY = 'quarterly', 'Quaterly'
    YEARLY = 'yearly', 'Yearly'
