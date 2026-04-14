from django.db import models
from django.utils.translation import gettext_lazy as _

from core.constants import UPLOAD_DOCUMENT_FILE_TYPE_NAMES
from core.enum_utils import build_enum


FileTypeName = models.TextChoices('FileTypeName', build_enum(UPLOAD_DOCUMENT_FILE_TYPE_NAMES))
