from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .serializers import (
    CreditCaseSerializer,
    AccountApplicationSerializer,
    BuroDeCreditoReportSerializer,
    LoanAccountApplicationSerializer,
    LoanVerdictAISerializer,
    LoanVerdictSerializer,
)
from .models import (
    CreditCase,
    AccountApplication,
    BuroDeCreditoReport,
    LoanAccountApplication,
    LoanVerdict,
    LoanVerdictAI,
)


class CreditCaseViewSet(ModelViewSet):

    queryset = CreditCase.objects.all()
    serializer_class = CreditCaseSerializer


# ================================================================
class AccountApplicationViewSet(ModelViewSet):

    queryset = AccountApplication.objects.all()
    serializer_class = AccountApplicationSerializer


class LoanAccountApplicationViewSet(ModelViewSet):

    queryset = LoanAccountApplication.objects.all()
    serializer_class = LoanAccountApplicationSerializer


class LoanVerdictViewSet(ModelViewSet):  # TODO ReadOnlyModelViewSet when prod

    queryset = LoanVerdict.objects.all()
    serializer_class = LoanVerdictSerializer


class LoanVerdictAIViewSet(ReadOnlyModelViewSet):

    queryset = LoanVerdictAI.objects.all()
    serializer_class = LoanVerdictAISerializer


class BuroDeCreditoReportViewSet(
    ReadOnlyModelViewSet,
):

    queryset = BuroDeCreditoReport.objects.all()
    serializer_class = BuroDeCreditoReportSerializer
# ================================================================
