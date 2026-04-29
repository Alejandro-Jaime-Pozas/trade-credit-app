from django.db import models
from django.utils.translation import gettext_lazy as _

from core.constants import UPLOAD_DOCUMENT_FILE_TYPE_NAMES
from core.enum_utils import build_enum


FileTypeName = models.TextChoices('FileTypeName', build_enum(UPLOAD_DOCUMENT_FILE_TYPE_NAMES))

class ModelVersion(models.TextChoices):
    """
    The version of the model used for processing the document.
     This is important to track for auditing and debugging purposes.
     It allows us to know which version of the model was used for a given document,
     and to compare results across different versions of the model.
    """

    # Use the same naming convention as the model names in the integrations.<ai_api>.constants.py file for the internal db value.
    GPT_5_NANO = 'gpt-5-nano', _('GPT-5 Nano')
