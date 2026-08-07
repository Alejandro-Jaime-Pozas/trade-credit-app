from uuid6 import uuid7

from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.core.validators import FileExtensionValidator
from django.db import models
from django.utils import timezone

from customers.models import Customer
from identity.models import Organization, User
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
        related_name='upload_documents',
        help_text='the customer the file belongs to.',
    )
    credit_case = models.ForeignKey(
        CreditCase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='upload_documents',
        help_text='the credit case the file belongs to.',
    )
    # Custom field values (dynamic Labels) attached to this document.
    # GenericRelation so deleting a document cascades away its LabelValue rows too.
    label_values = GenericRelation('storage.LabelValue')

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
    A user-defined dynamic custom field. A Label is a field *definition* only —
    it does not store any value itself. Each Label is scoped to exactly one model
    (via `content_type`), so it behaves like adding a new field to that model
    without needing a migration.

    Example: a user creates a Label named "sucursal" scoped to CreditCase. From then
    on, every CreditCase can have (at most) one "sucursal" LabelValue, and that value
    shows up in the CreditCase's `custom_fields` like a real field would.

    ┌─────┬──────────┬──────────────┬──────────────┐
    │ id  │   name   │ content_type │ organization │
    ├─────┼──────────┼──────────────┼──────────────┤
    │ 1   │ sucursal │ creditcase   │ Gringotts    │
    └─────┴──────────┴──────────────┴──────────────┘
    """

    name = models.CharField(
        max_length=50,
        help_text='The custom field name, e.g. "sucursal".',
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='labels',
        null=True,
        blank=True,
        help_text='The organization that owns this custom field definition.',
    )
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name='+',
        null=True,
        blank=True,
        help_text='The single model this custom field applies to, e.g. CreditCase.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='The user that created this custom field.',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'content_type', 'name'],
                name='unique_label_per_organization_and_model',
            ),
        ]

    def __str__(self):
        return f'name={self.name}, content_type={self.content_type}'


class LabelValue(models.Model):
    """
    The value of a Label (custom field) for one specific object.

    One row per (label, object) — the unique constraint below is what makes this
    behave like a real field: setting the same label on the same object again
    must UPDATE this row, never create a second one (see LabelValueViewSet).

    ┌─────┬──────────────┬──────────────┬───────────┬───────────┐
    │ id  │    label     │ content_type │ object_id │   value   │
    ├─────┼──────────────┼──────────────┼───────────┼───────────┤
    │ 1   │ sucursal (1) │ creditcase   │ 47        │ MTY Norte │
    └─────┴──────────────┴──────────────┴───────────┴───────────┘
    """

    label = models.ForeignKey(
        Label,
        on_delete=models.CASCADE,
        related_name='values',
        help_text='The custom field definition this value belongs to.',
    )
    # content_type is denormalized from label.content_type (always equal to it),
    # but Django's GenericForeignKey/GenericRelation require a real field here to
    # build queries against — it can't be derived through the label FK at query time.
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text='The model type of the labeled object (must match label.content_type).',
    )
    object_id = models.PositiveBigIntegerField(
        help_text='The primary key of the labeled object.',
    )
    content_object = GenericForeignKey('content_type', 'object_id')
    value = models.CharField(
        max_length=250,
        help_text='The field value, e.g. "MTY Norte".',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='The user that set this value.',
    )

    class Meta:
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['label', 'content_type', 'object_id'],
                name='unique_value_per_label_per_object',
            ),
        ]

    def __str__(self):
        return f'label={self.label.name}, object_id={self.object_id}, value={self.value}'
