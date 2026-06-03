from uuid6 import uuid7

from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from customers.models import Customer
from identity.models import User
from processing.models import (
    CreditCase,
)
from core.constants import ALLOWED_FILE_EXTENSIONS
from core.validators import validate_file_size
from .choices_for_models import FileTypeName, ModelVersion


def document_upload_to(instance, filename):
    # Adjust to taste. This puts documents under media/upload_documents/YYYY/MM/DD
    dt = instance.uploaded_at
    if not dt:
        dt = timezone.now()
        instance.uploaded_at = dt
    return f"upload_documents/{dt:%Y/%m/%d}/{instance.uuid}--{filename}"


class UploadDocument(models.Model):
    """
    Any semi or unstructured data file that a user uploads.

    A UploadDocument can belong to other models, including
    but not limited to, Account, AccountApplication.
    """

    uuid = models.UUIDField(
        default=uuid7,
        editable=False,
        db_index=True,
        help_text='The uuid for this object.',
    )
    original_title = models.CharField(
        max_length=1024,
        null=True,
        blank=True,
        help_text='the uploaded file\'s unmodified original title.',
    )
    file = models.FileField(
        upload_to=document_upload_to,
        validators=[
            FileExtensionValidator(ALLOWED_FILE_EXTENSIONS),
            validate_file_size,
        ],
        help_text='the file object that is stored.',
    )  # contains: name, path, size
    friendly_file_name = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text='friendly file name for readability.',
    )
    file_type_name = models.CharField(
        max_length=50,
        choices=FileTypeName.choices,
        null=True,
        blank=True,
        help_text='file type name given the choices list.',
    )
    extracted_data = models.JSONField(
        null=True,
        blank=True,
        help_text='Useful JSON data that gpt extracts from files.',
    )
    mimetype = models.CharField(
        max_length=1000,
        null=True,
        blank=True,
        help_text='mime type of the file.',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='the user that uploaded the file.',
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='the customer the file belongs to.',
    )
    credit_case = models.ForeignKey(
        CreditCase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='the credit case the file belongs to.',
    )

    def save(self, *args, **kwargs):
        if not self.original_title and self.file:
            self.original_title = self.file.name

        # TODO if not customer nor credit_case, raise error, do not allow creation
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.file.name} ({self.file_type_name})'


class DocumentDataExtract(models.Model):
    """
    This model stores the extracted data from a UploadDocument after
    processing with an AI model.
    """

    raw_json = models.JSONField(
        null=True,
        blank=True,
        help_text='the raw json data extracted from the document using AI. Pydantic models' \
                    ' can be used to parse this data into more structured formats if desired.',
    )
    confidence_score = models.FloatField(
        null=True,
        blank=True,
        help_text='a confidence score between 0 and 1 indicating the AI\'s confidence' \
                    ' in the extracted data.',
    )
    model_version = models.CharField(
        choices=ModelVersion.choices,
        null=True,
        blank=True,
        help_text='the version of the AI model used for extraction, if applicable.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    upload_document = models.ForeignKey(
        UploadDocument,
        on_delete=models.CASCADE,
        related_name='document_data_extracts',
        help_text='the UploadDocument that this extracted data is associated with.',
    )

    def __str__(self):
        return f'id={self.id}'


class Label(models.Model):
    """
    Super abstract, general purpose label that can be applied to any model instance
    in the system, mainly for UI filtering and categorization purposes.

    Example: user wants a new label named 'sucursal'. User then creates a few values for it.
    Label is linked to appropiate model based on the endpoint/UI location. User can then
    filter CreditCases by 'sucursal'.
    """

    name = models.CharField(
        max_length=50,
        help_text='The name of the label, e.g. "sucursal".',
    )
    value = models.CharField(
        max_length=250,
        help_text='The value of the label, e.g. "sucursal MTY norte".',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Can link labels to other models as well, as needed
    credit_cases = models.ManyToManyField(
        CreditCase,
        related_name='labels',
        help_text='The CreditCase that this label is associated with.',
    )
    customers = models.ManyToManyField(
        Customer,
        related_name='labels',
        help_text='The Customer that this label is associated with.',
    )

    def __str__(self):
        return f'name={self.name}, value={self.value}'
