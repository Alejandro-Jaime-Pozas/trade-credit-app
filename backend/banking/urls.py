from rest_framework import routers

from core.constants import (
    ACCOUNT_BASENAME,
    CHECKING_ACCOUNT_BASENAME,
    LOAN_ACCOUNT_BASENAME,
    TRANSACTION_BASENAME,
)

from .views import (
    AccountViewSet,
    CheckingAccountViewSet,
    LoanAccountViewSet,
    TransactionViewSet,
)

router = routers.DefaultRouter()

router.register(
    'accounts',
    AccountViewSet,
    basename=ACCOUNT_BASENAME,
)
router.register(
    'accounts/checking',
    CheckingAccountViewSet,
    basename=CHECKING_ACCOUNT_BASENAME,
)
router.register(
    'accounts/loan',
    LoanAccountViewSet,
    basename=LOAN_ACCOUNT_BASENAME,
)
# TODO include later if needed
# router.register(
#     'transactions',
#     TransactionViewSet,
#     basename=TRANSACTION_BASENAME,
# )

urlpatterns = router.urls
