from functools import reduce
from operator import or_

from django.contrib.contenttypes.models import ContentType
from django.db import models as django_models
from django.db import transaction
from rest_framework import serializers

from core.constants import (
    CREDIT_CASE_BASENAME,
    CUSTOMER_BASENAME,
    LABELABLE_MODEL_ORG_LOOKUPS,
    ORGANIZATION_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
    CREDIT_CASE_ID,
)
from core.serializer_utils import NamedHyperlinkedModelSerializer, NamedHyperlinkedRelatedField
from processing.models import CreditCase

from .models import (
    CreditCaseRequirement,
    DocumentDataExtract,
    FileType,
    Label,
    LabelValue,
    RequirementTemplate,
    RequirementTemplateItem,
    UploadDocument,
)


class UploadDocumentSerializer(NamedHyperlinkedModelSerializer):
    # # TODO later with frontend ready uncomment this below to allow multi file uploads
    # files = serializers.ListField(
    #     child=serializers.FileField(),
    #     write_only=True,
    #     allow_empty=False,
    # )  # this is basically a container for the file field, use it to create multiple files in single request

    # Dynamic custom fields (Labels) set on this document, e.g. {"sucursal": "MTY Norte"}.
    # Read-only here — values are set/updated via LabelValueViewSet.
    custom_fields = serializers.SerializerMethodField()

    def get_custom_fields(self, obj) -> dict[str, str]:
        return {lv.label.name: lv.value for lv in obj.label_values.select_related('label').all()}

    class Meta:
        model = UploadDocument
        fields = [
            'url',
            'id',
            'uploaded_at',
            'original_title',
            # 'files',  # TODO later uncomment when frontend ready to upload multi files
            'file',
            'friendly_file_name',
            'file_type_name',
            'mimetype',
            'extracted_data',
            'credit_case',
            'customer',
            'custom_fields',
        ]
        read_only_fields = [
            'original_title',
            'uploaded_at',
            'mimetype',
            # 'file',  # TODO later uncomment when frontend ready to upload multi files
            'friendly_file_name',
            # 'file_type_name' is writable on purpose: GPT classification can get a
            # document wrong, and a mislabelled file silently fails to satisfy the
            # requirement it should. The user must be able to correct it. On create it
            # is still effectively read-only, because classification runs after save and
            # overwrites whatever was sent (see UploadDocumentViewSet.create).
            'extracted_data',
        ]

    def validate_file_type_name(self, value):
        """
        Only allow correcting a document to a type this organization actually has.

        Free text here would be worse than a wrong GPT label: requirements are matched on
        this exact key, so a typo produces a document that can never satisfy anything.
        `unknown` stays allowed — it is the classifier's own "no idea" bucket and a valid
        thing for a user to fall back to.
        """
        if not value or value == 'unknown':
            return value

        # The document's own organization isn't known until validate() has run, so accept
        # any key in the catalog the requesting user can see (global + their own orgs).
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        file_types = FileType.objects.all()
        if user is not None and user.is_authenticated and not user.is_superuser:
            file_types = file_types.filter(
                django_models.Q(organization__isnull=True)
                | django_models.Q(organization__in=user.organizations.all())
            )

        if not file_types.filter(key=value).exists():
            raise serializers.ValidationError(
                f'"{value}" is not a known file type for your organization.'
            )

        return value

    def validate(self, attrs):
        # On a PATCH the payload usually carries only the field being changed, so these
        # links have to be read from the row being edited when they aren't being sent.
        # Reading them from `attrs` alone would reject every partial update — including
        # the file_type_name correction above — as "missing customer/credit_case".
        instance = self.instance

        def resolve(field):
            if field in attrs:
                return attrs[field]
            return getattr(instance, field, None) if instance else None

        customer = resolve('customer')
        credit_case = resolve('credit_case')

        # A doc must be linked to at least one of credit_case / customer (both
        # are optional FKs, so nothing else enforces this) — see
        # UploadDocument.save()'s TODO and handle_upload_document_created().
        if not credit_case and not customer:
            raise serializers.ValidationError(
                'You must provide a credit_case and/or a customer field.'
            )

        # Both FKs are optional and independent, so a user belonging to more than one
        # organization could otherwise link a document to a customer in org A and a
        # credit case in org B, leaving one row visible from two tenants (the
        # organization_scoped_fields check on UploadDocumentViewSet only guarantees
        # each FK *individually* belongs to one of the user's orgs, not that they
        # belong to the SAME one). Uses the resolved values above, so changing only one
        # of the two on a PATCH is still checked against the other.
        if customer and credit_case and credit_case.customer_id != customer.id:
            raise serializers.ValidationError(
                'credit_case and customer must belong to the same customer record.'
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """
        Create the UploadDocument object(s), link to a CreditCase object.

        Must be linked to either a CreditCase object
        or a Customer object or both.

        Return a list of UploadDocument db objects.
        """

        files = validated_data.pop('files', [])

        if not files:
            file = validated_data.pop('file', None)
            if file:
                files = [file]

        created_docs = []
        for f in files:
            # Create UploadDocument (only if it contains relation to parent model) and update related CreditCase with UploadDocument
            doc = UploadDocument.objects.create(**validated_data, file=f)  # validated_data for now just includes credit_case_id..

            created_docs.append(doc)

        return created_docs


class DocumentDataExtractSerializer(NamedHyperlinkedModelSerializer):
    upload_document = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{UPLOAD_DOCUMENT_BASENAME}-detail',
    )
    class Meta:
        model = DocumentDataExtract
        fields = [
            'url',
            'id',
            'raw_json',
            'confidence_score',
            'model_version',
            'created_at',
            'upload_document',
        ]
        read_only_fields = [
            'raw_json',
            'confidence_score',
            'model_version',
            'created_at',
            'upload_document',
        ]


class LabelSerializer(NamedHyperlinkedModelSerializer):
    """
    A Label is a custom field *definition* the user creates, e.g. "sucursal" for
    CreditCase. `content_type` picks which single model it applies to, by model
    name (e.g. "creditcase") rather than a raw database id, since ContentType ids
    aren't stable across databases.
    """

    content_type = serializers.SlugRelatedField(
        slug_field='model',
        # Only content types for the models the app actually supports labeling on
        # (CreditCase, Customer, UploadDocument) can be chosen.
        queryset=ContentType.objects.filter(model__in=LABELABLE_MODEL_ORG_LOOKUPS),
    )
    organization = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ORGANIZATION_BASENAME}-detail',
        # Organization's own __str__ shows its email domain, not its name.
        display_source='name',
    )

    class Meta:
        model = Label
        fields = [
            'url',
            'id',
            'name',
            'content_type',
            'organization',
            'created_at',
        ]
        read_only_fields = [
            'organization',
            'created_at',
        ]


class LabelValueSerializer(NamedHyperlinkedModelSerializer):
    """
    The value of a Label (custom field) for one specific object, e.g.
    label="sucursal", object_id=<some CreditCase id>, value="MTY Norte".

    `content_type` is never taken from the client — it's always derived from
    `label.content_type`, so a value can never end up attached to the wrong kind
    of object.
    """

    content_type = serializers.SlugRelatedField(
        source='label.content_type',
        slug_field='model',
        read_only=True,
    )

    class Meta:
        model = LabelValue
        fields = [
            'url',
            'id',
            'label',
            'content_type',
            'object_id',
            'value',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'content_type',
            'created_at',
            'updated_at',
        ]
        # Label's own __str__ is a debug-style string ("name=X, content_type=Y") — the
        # label's `name` alone reads much better as the display text for the link.
        extra_kwargs = {
            'label': {'display_source': 'name'},
        }

    # By default a HyperlinkedModelSerializer's auto-generated FK field for `label`
    # allows/lists EVERY organization's labels (`Label.objects.all()`), not just the
    # requesting user's own. That's narrowed declaratively by
    # LabelValueViewSet.organization_scoped_fields (see OrganizationScopedMixin), so
    # another org's label never even appears as a valid choice, on top of the
    # `validate()` check below.

    def validate(self, attrs):
        """
        Confirm (1) the label itself belongs to one of the requesting user's
        organizations, and (2) the target object (by content_type + object_id)
        actually exists within THAT SAME organization — not just any org the
        user happens to belong to. Without check (1), a user could attach
        another organization's label definition to one of their own objects,
        which is exactly what check (2) alone missed before.
        """
        label = attrs.get('label') or getattr(self.instance, 'label', None)
        object_id = attrs.get('object_id', getattr(self.instance, 'object_id', None))
        user = self.context['request'].user

        if not user.is_superuser and label.organization_id not in set(
            user.organizations.values_list('id', flat=True)
        ):
            raise serializers.ValidationError('You do not have access to this label.')

        model_class = label.content_type.model_class()
        org_lookups = LABELABLE_MODEL_ORG_LOOKUPS.get(label.content_type.model, [])

        # An object is only a valid target for this label if it's reachable
        # from the LABEL's own organization — not merely "some org the user
        # belongs to" — otherwise label and object could end up in different
        # organizations while the (unrelated) user happens to have access to both.
        org_reachable_q = reduce(
            or_,
            (django_models.Q(**{lookup: label.organization}) for lookup in org_lookups),
        )
        if not model_class.objects.filter(org_reachable_q, pk=object_id).exists():
            raise serializers.ValidationError(
                f'No {label.content_type.model} with id={object_id} found in the label\'s organization.'
            )

        return attrs


class FileTypeSerializer(NamedHyperlinkedModelSerializer):
    """
    A kind of document the app can recognize, e.g. "bank_statement".

    Read-only: the app-provided types come from core/file_type_catalog.py via
    `manage.py sync_file_types`. Letting organizations create their own is planned
    (see docs/versions/v2.md) but not implemented.
    """

    is_global = serializers.SerializerMethodField()

    def get_is_global(self, obj) -> bool:
        """True for app-provided types, which every organization can use."""
        return obj.organization_id is None

    class Meta:
        model = FileType
        fields = [
            'url',
            'id',
            'key',
            'label_en',
            'label_es',
            'category',
            'months_required',
            'is_active',
            'is_global',
        ]


class RequirementTemplateItemSerializer(serializers.ModelSerializer):
    """
    One document type listed in a requirement template.

    Written as part of its parent template's payload (see RequirementTemplateSerializer),
    not through its own endpoint, so a template and its lines are always saved together.
    """

    file_type_key = serializers.CharField(source='file_type.key', read_only=True)
    label_en = serializers.CharField(source='file_type.label_en', read_only=True)

    class Meta:
        model = RequirementTemplateItem
        fields = [
            'id',
            'file_type',
            'file_type_key',
            'label_en',
            'is_required',
            'months_required',
            'order',
        ]


class RequirementTemplateSerializer(NamedHyperlinkedModelSerializer):
    """
    An organization's reusable list of documents to ask for on a credit case.

    `items` is writable and behaves as a full replacement: whatever list is sent becomes
    the template's contents. That matches how the UI edits a template (as one list the
    user rearranges) and keeps the client from having to diff line-by-line.

    Editing a template does NOT change existing credit cases. Use the `impact` and
    `apply` actions on this viewset to review and push changes onto open cases.
    """

    items = RequirementTemplateItemSerializer(many=True)
    organization = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ORGANIZATION_BASENAME}-detail',
        # Organization's own __str__ shows its email domain, not its name.
        display_source='name',
    )

    class Meta:
        model = RequirementTemplate
        fields = [
            'url',
            'id',
            'name',
            'is_default',
            'organization',
            'items',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'organization',
            'created_at',
            'updated_at',
        ]

    def __init__(self, *args, **kwargs):
        """
        Narrow the file types selectable on nested items to the ones this user may use:
        the app-provided (global) ones plus their own organization's.

        Without this, DRF builds the nested `file_type` field with an unfiltered
        FileType.objects.all(), which would offer another organization's custom types
        as valid input once those exist.
        """
        super().__init__(*args, **kwargs)

        request = self.context.get('request')
        if request is None or not request.user.is_authenticated or request.user.is_superuser:
            return

        item_fields = getattr(self.fields['items'], 'child', self.fields['items']).fields
        file_type_field = item_fields.get('file_type')
        if file_type_field is not None and getattr(file_type_field, 'queryset', None) is not None:
            file_type_field.queryset = file_type_field.queryset.filter(
                django_models.Q(organization__isnull=True)
                | django_models.Q(organization__in=request.user.organizations.all())
            )

    def validate_items(self, items):
        """Reject a template that lists the same document type twice."""
        file_types = [item['file_type'] for item in items]
        if len(file_types) != len(set(file_types)):
            raise serializers.ValidationError('A template cannot list the same file type twice.')
        return items

    def _replace_items(self, template, items_data):
        """Swap the template's lines for the supplied list, in one transaction."""
        template.items.all().delete()
        RequirementTemplateItem.objects.bulk_create([
            RequirementTemplateItem(
                template=template,
                file_type=item['file_type'],
                is_required=item.get('is_required', True),
                months_required=item.get('months_required'),
                order=item.get('order', order),
            )
            for order, item in enumerate(items_data)
        ])

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        template = RequirementTemplate.objects.create(**validated_data)
        self._replace_items(template, items_data)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if items_data is not None:
            self._replace_items(instance, items_data)

        return instance


class CreditCaseRequirementSerializer(NamedHyperlinkedModelSerializer):
    """
    One document a specific credit case needs.

    Requirements created through this endpoint are always `source='manual'` — they are
    the per-case additions a user makes for one particular customer, and a later template
    re-sync will leave them untouched. Template-sourced rows are created by seeding, not
    here.
    """

    # Selected by id rather than by hyperlink, matching how a template's items are
    # written and how the frontend gets them from /file-types/.
    file_type = serializers.PrimaryKeyRelatedField(queryset=FileType.objects.all())
    # Declared explicitly with default=True. DRF's BooleanField treats a field that is
    # simply ABSENT from form-encoded input as False, so a client adding a document
    # without mentioning is_required would silently get an OPTIONAL requirement — one
    # that never blocks the case from completing. Adding a document should mean it is
    # required unless the client says otherwise.
    is_required = serializers.BooleanField(default=True)
    file_type_key = serializers.CharField(source='file_type.key', read_only=True)
    label_en = serializers.CharField(source='file_type.label_en', read_only=True)

    class Meta:
        model = CreditCaseRequirement
        fields = [
            'url',
            'id',
            'credit_case',
            'file_type',
            'file_type_key',
            'label_en',
            'is_required',
            'months_required',
            'source',
            'created_at',
            'synced_at',
        ]
        read_only_fields = [
            'source',
            'created_at',
            'synced_at',
        ]
        # DRF would otherwise auto-add a UniqueTogetherValidator for
        # unique(credit_case, file_type) and reject the request before the view runs.
        # That collision is legitimate here: a document previously dropped from this case
        # still has a row, flagged excluded, and re-adding it must turn that row back on
        # rather than fail. CreditCaseRequirementViewSet.perform_create handles it.
        validators = []

    def validate(self, attrs):
        """
        Confirm the credit case and the file type are both things this user may use.

        The viewset's organization_scoped_fields already narrows these querysets, but
        this repeats the check independently: a scoped queryset protects the browsable
        API's choices, while this protects the actual write no matter how the request
        was built.
        """
        user = self.context['request'].user
        credit_case = attrs.get('credit_case') or getattr(self.instance, 'credit_case', None)
        file_type = attrs.get('file_type') or getattr(self.instance, 'file_type', None)

        if user.is_superuser:
            return attrs

        organizations = user.organizations.all()

        if credit_case is not None and credit_case.customer.organization not in organizations:
            raise serializers.ValidationError('You do not have access to this credit case.')

        # A file type is usable if it is app-provided (no organization) or owned by one
        # of the user's own organizations.
        if (
            file_type is not None
            and file_type.organization_id is not None
            and file_type.organization not in organizations
        ):
            raise serializers.ValidationError('You do not have access to this file type.')

        return attrs


class SetCreditCaseRequirementsSerializer(serializers.Serializer):
    """
    Request body for `POST /credit-cases/{id}/set-requirements/`.

    Two mutually exclusive modes, mirroring the two things the UI lets a user click when
    a credit case is created:

      - `requirement_template` — "use my organization's default". Rows are seeded from
        the template, so the case stays eligible for that template's future re-syncs.
      - `file_type_ids` — "pick documents for this customer". Rows are written as
        `source='manual'`, so a later re-sync deliberately leaves this case alone.

    Not a ModelSerializer: this describes an action's input, not a row to save.
    """

    requirement_template = serializers.PrimaryKeyRelatedField(
        queryset=RequirementTemplate.objects.all(),
        required=False,
    )
    file_type_ids = serializers.PrimaryKeyRelatedField(
        queryset=FileType.objects.all(),
        many=True,
        required=False,
    )

    def __init__(self, *args, **kwargs):
        """
        Narrow both fields to what this user may actually reference, so another
        organization's template or custom file type is never even a valid choice.
        """
        super().__init__(*args, **kwargs)

        request = self.context.get('request')
        if request is None or not request.user.is_authenticated or request.user.is_superuser:
            return

        organizations = request.user.organizations.all()

        self.fields['requirement_template'].queryset = RequirementTemplate.objects.filter(
            organization__in=organizations
        )
        # A file type is usable if it is app-provided (no organization) or owned by one
        # of the user's own organizations - the same "global OR mine" rule as
        # FileTypeViewSet.get_queryset().
        self.fields['file_type_ids'].child_relation.queryset = FileType.objects.filter(
            django_models.Q(organization__isnull=True)
            | django_models.Q(organization__in=organizations)
        ).distinct()

    def validate(self, attrs):
        """
        Exactly one mode must be chosen. Allowing both would leave it ambiguous whether
        the resulting rows should be template-sourced (re-syncable) or manual, and
        allowing neither is almost certainly a client bug rather than "clear everything".
        """
        template = attrs.get('requirement_template')
        file_types = attrs.get('file_type_ids')

        if template is not None and file_types:
            raise serializers.ValidationError(
                'Provide either requirement_template or file_type_ids, not both.'
            )
        if template is None and not file_types:
            raise serializers.ValidationError(
                'Provide either requirement_template or file_type_ids.'
            )

        return attrs
