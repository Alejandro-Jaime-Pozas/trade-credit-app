from django.core.validators import MinLengthValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from processing.models import (
    AccountApplication,
)
from core.str_utils import clean_account_name, create_account_number
from integrations.openai.requests.create_loan import test_loan
from core.date_utils import (
    get_default_debit_card_expiration_date,
    get_next_payment_date_from_interval,
)
from .constants import (
    ACCOUNT_NUMBER_LENGTH,
    CLABE_NUMBER_LENGTH,
    DEBIT_CARD_NUMBER_LENGTH,
)
from identity.models import (
    Company,
    User,
)
from .choices_for_models import (
    AccountType,
    LoanPaymentType,
    PaymentInterval,
)


class Account(models.Model):
    """
    Base Account model for bank accounts.
    Acts as the parent of detailed models like LoanAccount
    but functions as 1-to-1 relationship.
    """
    number = models.CharField(
        max_length=ACCOUNT_NUMBER_LENGTH,
        validators=[MinLengthValidator(ACCOUNT_NUMBER_LENGTH)],  # enforce exactly n chars ONLY ON SERIALIZERS, NOT IF DIRECT INSERT
        unique=True,
        null=True,
        blank=True,
        db_index=True,
    )
    clabe = models.CharField(
        max_length=CLABE_NUMBER_LENGTH,
        validators=[MinLengthValidator(CLABE_NUMBER_LENGTH)],
        unique=True,
        null=True,
        blank=True,
    )
    type = models.CharField(
        max_length=50,
        choices=AccountType.choices,
    )
    current_balance = models.DecimalField(
        max_digits=32,
        decimal_places=2,
        default=0.00,
    )
    name = models.CharField(  # TODO missing name implementation, need django signals since m2m to users.companies
        max_length=100,
        null=True,
        blank=True,  # best for analytics vs default=''
    )
    users = models.ManyToManyField(
        User,
        related_name='accounts',
        blank=True,
    )
    account_application = models.OneToOneField(
        AccountApplication,
        on_delete=models.PROTECT,  # prevent accidentally deleting acct if deleting app, instead must delete acct first always
        related_name='account',
    )

    def save(self, *args, **kwargs):
        
        is_new = self.pk is None

        if self.type and not self.name:
            self.name = clean_account_name(type_name=self.type)

        super().save(*args, **kwargs)

        if is_new and not self.number:  # self.number initially could be "" or None
            self.number = create_account_number(self.pk)
            super().save(update_fields=['number'])  # avoid re-saving everything, just number

    def __str__(self):
        return \
            f'<CheckingAccount|acct_id={self.id}, ' \
            f'acct_num={self.number}, name={self.name}>'


class CheckingAccount(models.Model):
    """
    Checking Account model extends the Account model.

    This is a Checking account where the user deposits/withdraws money.

    This includes the ability for the user to:

    - transfer money to and from that business account
    - view all of their transactions
    """
    debit_card_number = models.CharField(
        max_length=DEBIT_CARD_NUMBER_LENGTH,
        validators=[MinLengthValidator(DEBIT_CARD_NUMBER_LENGTH)],
        null=True,
        blank=True,
    )
    debit_card_expiration_date = models.DateField(
        default=get_default_debit_card_expiration_date,
        null=True,
        blank=True,
    )
    account = models.OneToOneField(
        Account,
        on_delete=models.CASCADE,
        related_name='checking_account',
    )

    def __str__(self):
        return f'<CheckingAccount|acct_id={self.account.id}, ' \
            f'acct_num={self.account.number}, ' \
            f'debit_card_num={self.debit_card_number}>'


class LoanAccount(models.Model):
    """
    Loan Account model extends the base Account model.

    This is a loan account where the user
    tracks their loanbalance and payments.

    Loan Account mainly allows user to make payments
    to it to reduce their loan debt.

    Args:
        - id
        - remaining_balance  <!-- later include principal balance vs interest balance -->
        - paid_balance  <!-- later include principal balance vs interest balance -->
        - payment_amount  <!-- later include principal vs interest -->
        - payment_interval
        - next_payment_date
        - FK account_id
    """
    remaining_balance = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
    )
    paid_balance = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        default=0.00,
    )
    payment_type = models.CharField(
        max_length=50,
        choices=LoanPaymentType.choices,
        default='fixed',
    )
    payment_amount = models.DecimalField(  # keep this simple for now just suppose fixed pmt.
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
    )
    payment_interval = models.CharField(
        max_length=20,
        choices=PaymentInterval.choices,
        default=PaymentInterval.MONTHLY,
    )
    next_payment_date = models.DateField(  # auto-calculated in save() method
        null=True,
        blank=True,
    )
    account = models.OneToOneField(
        Account,
        on_delete=models.CASCADE,
        related_name='loan_account',
    )

    # Auto-insert the next payment date based on interval
    def save(self, *args, **kwargs):
        if self.next_payment_date is None:
            self.next_payment_date = \
                get_next_payment_date_from_interval(self.payment_interval)  # works as long as payment_interval has a default/is not null
        super().save(*args, **kwargs)

    def __str__(self):
        return \
            f'<LoanAccount|acct_id={self.account.id}, ' \
            f'acct_num={self.account.number}, ' \
            f'remaining_balance={self.remaining_balance}>'
    ...


class Transaction(models.Model):
    """
    Transaction includes any transaction created within any
    Sol bank account, either from or to a Sol bank account
    that permits transactions.

    Fields:
        id
        amount
        created_at
        FK account
        FK company
        FK user
    """

    amount = models.DecimalField(
        max_digits=21,
        decimal_places=2,
    )
    created_at = models.DateTimeField(
        auto_now_add=True,  # adds default fixed timestamp to now
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name='transactions',
    )
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='transactions',
        null=True,
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='transactions',
    )

    def __str__(self):
        return \
            f'<Transaction|id={self.id}, created_at={self.created_at}, ' \
            f'amount={self.amount}, account={self.account}, ' \
            f'company={self.company}, user={self.user}>'
