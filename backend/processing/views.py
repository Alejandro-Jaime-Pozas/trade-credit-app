from django.db.utils import IntegrityError
from rest_framework.viewsets import ModelViewSet, GenericViewSet, ReadOnlyModelViewSet
from rest_framework.mixins import (
    ListModelMixin,
    RetrieveModelMixin,
    UpdateModelMixin,
)

from processing.services.loan_agreement_document import (
    handle_signed_loan_agreement_doc,
)

from .serializers import (
    AccountApplicationSerializer,
    BuroDeCreditoReportSerializer,
    LoanAccountApplicationSerializer,
    LoanAgreementDocumentSerializer,
    LoanVerdictAISerializer,
    LoanVerdictSerializer,
)
from .models import (
    AccountApplication,
    BuroDeCreditoReport,
    LoanAccountApplication,
    LoanVerdict,
    LoanVerdictAI,
    LoanAgreementDocument,
)


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


class LoanAgreementDocumentViewSet(
    ListModelMixin,
    RetrieveModelMixin,
    UpdateModelMixin,
    GenericViewSet,
):
    """ Only allow read and update so frontend can send user sign date. """

    queryset = LoanAgreementDocument.objects.all()
    serializer_class = LoanAgreementDocumentSerializer

    def perform_update(self, serializer):
        """
        If user request includes signed_at timestamp, create the Account
        and the LoanAccount objects since user agreed to loan terms.
        """

        loan_agmt_doc = serializer.save()
        acct_app = loan_agmt_doc.account_application

        if not acct_app:
            raise IntegrityError(f'LoanAgreementDocument object requires a linked relation to account_application, please provide it for: {loan_agmt_doc}')

        # If user has signed, and there is no existing acct or loan acct yet, create them
        if loan_agmt_doc.signed_at and not hasattr(acct_app, 'account'):
            handle_signed_loan_agreement_doc(
                # loan_agmt_doc=loan_agmt_doc,
                acct_app=acct_app,
            )


class BuroDeCreditoReportViewSet(
    ReadOnlyModelViewSet,
):

    queryset = BuroDeCreditoReport.objects.all()
    serializer_class = BuroDeCreditoReportSerializer
