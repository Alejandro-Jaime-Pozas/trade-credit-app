from rest_framework.viewsets import ModelViewSet

from .serializers import (
    AccountSerializer,
    CheckingAccountSerializer,
    LoanAccountSerializer,
    TransactionSerializer,
)
from .models import (
    Account,
    CheckingAccount,
    LoanAccount,
    Transaction,
)


class AccountViewSet(ModelViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    # filter for specific user's permissions


class CheckingAccountViewSet(ModelViewSet):
    queryset = CheckingAccount.objects.all()
    serializer_class = CheckingAccountSerializer
    # filter for specific user's permissions


class LoanAccountViewSet(ModelViewSet):
    queryset = LoanAccount.objects.all()
    serializer_class = LoanAccountSerializer
    # filter for specific user's permissions


class TransactionViewSet(ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    # filter for specific user's permissions
