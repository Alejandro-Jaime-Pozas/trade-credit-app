from rest_framework import routers

from core.constants import ORGANIZATION_BASENAME, USER_BASENAME

from .views import (
    OrganizationViewSet,
    UserViewSet,
)


router = routers.DefaultRouter()
router.register(
    'users',
    UserViewSet,
    basename=USER_BASENAME,
    )
router.register(
    'organizations',
    OrganizationViewSet,
    basename=ORGANIZATION_BASENAME,
    )
urlpatterns = router.urls
