from rest_framework.viewsets import (
    ModelViewSet,
    ReadOnlyModelViewSet,
)

from core.mixins import OrganizationScopedMixin

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


class CreditCaseViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):

    queryset = CreditCase.objects.all().order_by('-updated_at').prefetch_related('label_values__label')
    serializer_class = CreditCaseSerializer
    organization_lookup = 'customer__organization'
    organization_scoped_fields = {
        'customer': 'organization',
        'assigned_to': 'organizations',  # User -> Organization m2m (identity.Organization.users)
    }

    def perform_create(self, serializer):
        # Default assigned_to to the requesting user when the client didn't
        # explicitly set one (the frontend's create flow never sends it), so a
        # credit case is always owned by whoever created it. An explicit
        # assigned_to in the request (e.g. creating a case on someone else's
        # behalf) is still respected.
        if serializer.validated_data.get('assigned_to'):
            serializer.save()
        else:
            serializer.save(assigned_to=self.request.user)


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
