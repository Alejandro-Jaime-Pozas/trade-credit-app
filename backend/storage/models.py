import uuid

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
from .choices_for_models import FileTypeName


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
        default=uuid.uuid4,
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
        super().save(*args, **kwargs)

    def __str__(self):
        return f'<UploadDocument id={self.id}, name={self.file.name}, ' \
                f'file_type_name={self.file_type_name}>'
