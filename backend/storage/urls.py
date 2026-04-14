from rest_framework import routers

from core.constants import UPLOAD_DOCUMENT_BASENAME

from .views import (
    UploadDocumentViewSet,
)

router = routers.DefaultRouter()
router.register(
    'upload-documents',
    UploadDocumentViewSet,
    basename=UPLOAD_DOCUMENT_BASENAME,
)
urlpatterns = router.urls
