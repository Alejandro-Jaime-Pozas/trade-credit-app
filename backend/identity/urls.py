from rest_framework import routers

from core.constants import COMPANY_BASENAME, USER_BASENAME

from .views import (
    CompanyViewSet,
    UserViewSet,
)


router = routers.DefaultRouter()
router.register(
    'user',
    UserViewSet,
    basename=USER_BASENAME,
    )
router.register(
    'company',
    CompanyViewSet,
    basename=COMPANY_BASENAME,
    )
urlpatterns = router.urls
