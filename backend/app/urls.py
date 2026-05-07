"""
URL configuration for app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    # SpectacularRedocView,
)

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenBlacklistView,
)
from rest_framework.routers import DefaultRouter

from core.config import API_VERSION_PREFIX as api_ver
from identity.urls import router as identity_router
from customers.urls import router as customers_router
from processing.urls import router as processing_router
from storage.urls import router as storage_router

router = DefaultRouter()

# Merge routes from all apps here
router.registry.extend(identity_router.registry)
router.registry.extend(customers_router.registry)
router.registry.extend(processing_router.registry)
router.registry.extend(storage_router.registry)

urlpatterns = [
    path(api_ver, include(router.urls)),
    path('admin/', admin.site.urls),
    path(f'{api_ver}', include('rest_framework.urls')),
    path(f'{api_ver}auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path(f'{api_ver}auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path(f'{api_ver}schema/', SpectacularAPIView.as_view(), name='schema'),
    path(f'{api_ver}docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
