from rest_framework import routers

from core.constants import (
    ACCOUNT_APPLICATION_BASENAME,
    BURO_DE_CREDITO_REPORT_BASENAME,
    LOAN_ACCOUNT_APPLICATION_BASENAME,
    LOAN_AGREEMENT_DOCUMENT_BASENAME,
    LOAN_VERDICT_AI_BASENAME,
    LOAN_VERDICT_BASENAME,
)

from .views import (
    AccountApplicationViewSet,
    BuroDeCreditoReportViewSet,
    LoanAccountApplicationViewSet,
    LoanAgreementDocumentViewSet,
    LoanVerdictAIViewSet,
    LoanVerdictViewSet,
)

router = routers.DefaultRouter()

router.register(
    'account-applications',
    AccountApplicationViewSet,
    basename=ACCOUNT_APPLICATION_BASENAME,
)
router.register(
    'account-applications/loan',
    LoanAccountApplicationViewSet,
    basename=LOAN_ACCOUNT_APPLICATION_BASENAME,
)
router.register(
    'loan-verdicts',
    LoanVerdictViewSet,
    basename=LOAN_VERDICT_BASENAME,
)
router.register(
    'loan-verdicts-ai',
    LoanVerdictAIViewSet,
    basename=LOAN_VERDICT_AI_BASENAME,
)
router.register(
    'loan-agreement-documents',
    LoanAgreementDocumentViewSet,
    basename=LOAN_AGREEMENT_DOCUMENT_BASENAME,
)
router.register(
    'buro-de-credito-reports',
    BuroDeCreditoReportViewSet,
    basename=BURO_DE_CREDITO_REPORT_BASENAME,
)

urlpatterns = router.urls
