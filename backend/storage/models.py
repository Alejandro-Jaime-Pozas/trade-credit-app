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
from .choices_for_models import ModelVersion


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
        null=True,
        blank=True,
        help_text='The kind of document this is, as a file type key (e.g. '
                    '"bank_statement"). Set by the GPT classification step after upload, '
                    'not by the user. Deliberately has no `choices`: valid keys live in '
                    'the storage.FileType table (seeded from core/file_type_catalog.py) '
                    'so organizations can eventually define their own types, which a '
                    'static enum could never list.',
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


class FileType(models.Model):
    """
    One kind of document the app can recognize, e.g. "bank_statement".

    This table is the database mirror of the app's file type catalog
    (`core/file_type_catalog.py`), copied in by `manage.py sync_file_types`. It exists
    as a table — rather than staying a Python constant — because requirement templates
    need real foreign keys to point at, and because organizations will eventually be
    able to define their own file types alongside the app-provided ones.

    Rows with `organization = NULL` are the app-provided ("global") types, visible to
    every organization. Rows with an organization set belong to that organization alone.
    Creating an organization-owned type therefore never modifies a global row.

    ┌────┬─────────────────┬───────────────────┬───────────┬──────────────┐
    │ id │       key       │     label_en      │ category  │ organization │
    ├────┼─────────────────┼───────────────────┼───────────┼──────────────┤
    │ 1  │ bank_statement  │ Bank statement    │ financial │ NULL(global) │
    │ 7  │ carta_de_poder  │ Carta de poder    │ legal     │ Gringotts    │
    └────┴─────────────────┴───────────────────┴───────────┴──────────────┘
    """

    key = models.CharField(
        max_length=50,
        help_text='Stable identifier matching UploadDocument.file_type_name, e.g. '
                    '"bank_statement". Never change this after creation — documents are '
                    'already stored under it. Rename label_en/label_es instead.',
    )
    label_en = models.CharField(
        max_length=100,
        help_text='Display name in English, e.g. "Bank statement".',
    )
    label_es = models.CharField(
        max_length=100,
        help_text='Display name in Spanish, e.g. "Estado de cuenta bancario".',
    )
    category = models.CharField(
        max_length=20,
        help_text='One of core.file_type_catalog.FileTypeCategory: financial, legal or '
                    'other. Decides how recent a document must be to still count.',
    )
    months_required = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='How many distinct months this document must cover to satisfy a '
                    'requirement (e.g. 12 monthly bank statements). Null means one '
                    'document is enough regardless of period.',
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this type can still be added to new templates. Existing '
                    'documents keep resolving either way — a type is never deleted, '
                    'because documents already reference its key.',
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='file_types',
        null=True,
        blank=True,
        help_text='The organization that owns this type. NULL means it is an '
                    'app-provided type available to every organization.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='The user that created this type (null for app-provided types).',
    )

    class Meta:
        ordering = ['label_en']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'key'],
                name='unique_file_type_key_per_organization',
            ),
            # The constraint above does NOT cover the global rows: Postgres treats two
            # NULLs as different values, so ('NULL', 'bank_statement') twice would not
            # collide. This partial index covers exactly that case.
            models.UniqueConstraint(
                fields=['key'],
                condition=models.Q(organization__isnull=True),
                name='unique_global_file_type_key',
            ),
        ]

    def __str__(self):
        return f'{self.key} ({self.organization or "global"})'


class RequirementTemplate(models.Model):
    """
    An organization's reusable list of documents a credit case should ask for.

    Each organization defines its own; one may be flagged `is_default`, which is the
    one applied automatically to newly created credit cases. An organization with no
    template yet is the signal the frontend uses to prompt for onboarding.

    A template is NOT linked to credit cases directly. Its items are COPIED onto a case
    as CreditCaseRequirement rows when that case is created, so later edits here never
    silently rewrite what an already-reviewed case was required to provide.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='requirement_templates',
        help_text='The organization that owns this template.',
    )
    name = models.CharField(
        max_length=100,
        help_text='What the user calls this template, e.g. "Default" or "Clientes grandes".',
    )
    is_default = models.BooleanField(
        default=False,
        help_text='Whether new credit cases in this organization use this template '
                    'automatically. At most one per organization.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='The user that created this template.',
    )

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_requirement_template_name_per_organization',
            ),
            # Partial index: only rows where is_default is true participate, so an
            # organization can have many templates but only one marked default.
            models.UniqueConstraint(
                fields=['organization'],
                condition=models.Q(is_default=True),
                name='unique_default_requirement_template_per_organization',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.organization.name})'


class RequirementTemplateItem(models.Model):
    """
    One document type listed in a RequirementTemplate.

    This is the "line item" of a template: the template says WHICH documents, each item
    says which single document type and how strictly it's needed.
    """

    template = models.ForeignKey(
        RequirementTemplate,
        on_delete=models.CASCADE,
        related_name='items',
        help_text='The template this line belongs to.',
    )
    file_type = models.ForeignKey(
        FileType,
        on_delete=models.PROTECT,
        related_name='template_items',
        help_text='The kind of document being asked for.',
    )
    is_required = models.BooleanField(
        default=True,
        help_text='True means a credit case is incomplete without it. False means it is '
                    'shown as a nice-to-have and never blocks completion.',
    )
    months_required = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Overrides FileType.months_required for this template only. Null means '
                    'use the file type\'s own value.',
    )
    order = models.PositiveSmallIntegerField(
        default=0,
        help_text='Display order within the template.',
    )

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['template', 'file_type'],
                name='unique_file_type_per_requirement_template',
            ),
        ]

    def __str__(self):
        return f'{self.template.name}: {self.file_type.key}'


class CreditCaseRequirement(models.Model):
    """
    One document a specific credit case needs — the per-case SNAPSHOT of a requirement.

    Why a copy instead of pointing at the template: this is a credit approval system, so
    what a case required must stay true to the moment it was reviewed. If a case were to
    read its requirements live from a template, editing that template later would
    retroactively change what "complete" meant for cases already decided.

    `source` records where the row came from and is what makes re-syncing safe:

      - 'template' — copied from a template, so a later re-sync may add/remove it.
      - 'manual'   — added by a user for this case specifically (e.g. an extra document
                     needed for one particular customer). A re-sync NEVER touches these.
    """

    class Source(models.TextChoices):
        """Where this requirement came from — see the note on re-syncing above."""
        TEMPLATE = 'template', 'Template'
        MANUAL = 'manual', 'Manual'

    credit_case = models.ForeignKey(
        CreditCase,
        on_delete=models.CASCADE,
        related_name='requirements',
        help_text='The credit case that needs this document.',
    )
    file_type = models.ForeignKey(
        FileType,
        on_delete=models.PROTECT,
        related_name='credit_case_requirements',
        help_text='The kind of document being asked for.',
    )
    is_required = models.BooleanField(
        default=True,
        help_text='True means the case is incomplete without it. False means it is '
                    'listed as optional and never blocks completion.',
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.TEMPLATE,
        help_text='Whether this came from a template (re-syncable) or was added by hand '
                    'for this case (never overwritten by a re-sync).',
    )
    source_template = models.ForeignKey(
        RequirementTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='seeded_requirements',
        help_text='The template this was copied from, so a later edit of that template '
                    'knows which cases it can offer to update.',
    )
    months_required = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text='Overrides FileType.months_required for this case only.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When this row was last added or changed by a template re-sync. Null '
                    'means it has not been touched since the case was created.',
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='The user that added this requirement, or ran the sync that added it.',
    )

    class Meta:
        ordering = ['file_type__label_en']
        constraints = [
            models.UniqueConstraint(
                fields=['credit_case', 'file_type'],
                name='unique_file_type_per_credit_case',
            ),
        ]

    def __str__(self):
        return f'credit_case={self.credit_case_id}, file_type={self.file_type.key}'
