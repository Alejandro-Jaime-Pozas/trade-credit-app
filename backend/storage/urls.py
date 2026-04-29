from rest_framework import routers

from core.constants import (
    DOCUMENT_DATA_EXTRACT_BASENAME,
    LABEL_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
)
from .views import (
    DocumentDataExtractViewSet,
    LabelViewSet,
    UploadDocumentViewSet,
)

router = routers.DefaultRouter()
router.register(
    'upload-documents',
    UploadDocumentViewSet,
    basename=UPLOAD_DOCUMENT_BASENAME,
)
router.register(
    'document-data-extracts',
    DocumentDataExtractViewSet,
    basename=DOCUMENT_DATA_EXTRACT_BASENAME,
)
router.register(
    'labels',
    LabelViewSet,
    basename=LABEL_BASENAME,
)

urlpatterns = router.urls
