from rest_framework import routers

from core.constants import (
    CUSTOMER_BASENAME,
    CUSTOMER_CONTACT_BASENAME,
)

from .views import (
    CustomerViewSet,
    CustomerContactViewSet,
)


router = routers.DefaultRouter()

router.register(
    'customers',
    CustomerViewSet,
    basename=CUSTOMER_BASENAME,
)
router.register(
    'customer-contacts',
    CustomerContactViewSet,
    basename=CUSTOMER_CONTACT_BASENAME,
)

urlpatterns = router.urls
