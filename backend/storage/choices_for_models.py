from django.db import models
from django.utils.translation import gettext_lazy as _


# NOTE: `file_type_name` used to be a TextChoices enum generated from a Python set of
# names. It no longer is: file types now live in the database (storage.FileType, seeded
# from core/file_type_catalog.py) so that organizations can eventually add their own,
# and a static enum can't enumerate database rows. `UploadDocument.file_type_name` is
# therefore a plain CharField holding a catalog key.


class ModelVersion(models.TextChoices):
    """
    The version of the model used for processing the document.
     This is important to track for auditing and debugging purposes.
     It allows us to know which version of the model was used for a given document,
     and to compare results across different versions of the model.
    """

    # Use the same naming convention as the model names in the integrations.<ai_api>.constants.py file for the internal db value.
    GPT_5_NANO = 'gpt-5-nano', _('GPT-5 Nano')
