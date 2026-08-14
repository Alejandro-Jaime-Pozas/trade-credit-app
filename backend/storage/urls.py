from rest_framework import routers

from core.constants import (
    CREDIT_CASE_REQUIREMENT_BASENAME,
    DOCUMENT_DATA_EXTRACT_BASENAME,
    FILE_TYPE_BASENAME,
    LABEL_BASENAME,
    LABEL_VALUE_BASENAME,
    REQUIREMENT_TEMPLATE_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
)
from .views import (
    CreditCaseRequirementViewSet,
    DocumentDataExtractViewSet,
    FileTypeViewSet,
    LabelViewSet,
    LabelValueViewSet,
    RequirementTemplateViewSet,
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
router.register(
    'label-values',
    LabelValueViewSet,
    basename=LABEL_VALUE_BASENAME,
)
router.register(
    'file-types',
    FileTypeViewSet,
    basename=FILE_TYPE_BASENAME,
)
router.register(
    'requirement-templates',
    RequirementTemplateViewSet,
    basename=REQUIREMENT_TEMPLATE_BASENAME,
)
router.register(
    'credit-case-requirements',
    CreditCaseRequirementViewSet,
    basename=CREDIT_CASE_REQUIREMENT_BASENAME,
)

urlpatterns = router.urls
