from rest_framework import serializers

from core.constants import LOAN_ACCOUNT_BASENAME

from .models import (
    Account,
    CheckingAccount,
    LoanAccount,
    Transaction,
)


class AccountSerializer(serializers.HyperlinkedModelSerializer):
    loan_account = serializers.HyperlinkedRelatedField(
        read_only=True,
        view_name=f'{LOAN_ACCOUNT_BASENAME}-detail',
    )
    class Meta:
        model = Account
        fields = [
            'url',
            'id',
            'number',
            'clabe',
            'type',
            'current_balance',
            'name',
            'loan_account',
        ]


class CheckingAccountSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CheckingAccount
        fields = [
            'url',
            'id',
            'debit_card_number',
            'debit_card_expiration_date',
        ]


class LoanAccountSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = LoanAccount
        fields = [
            'url',
            'id',
            'remaining_balance',
            'paid_balance',
            'payment_type',
            'payment_amount',
            'payment_interval',
            'next_payment_date',
        ]


class TransactionSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            'url',
            'id',
            'amount',
            'created_at',
        ]
