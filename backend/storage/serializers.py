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
from processing.models import CreditCase

from .models import DocumentDataExtract, Label, LabelValue, UploadDocument


class UploadDocumentSerializer(serializers.HyperlinkedModelSerializer):
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
            'file_type_name',
            'extracted_data',
        ]

    def validate(self, attrs):
        # A doc must be linked to at least one of credit_case / customer (both
        # are optional FKs, so nothing else enforces this) — see
        # UploadDocument.save()'s TODO and handle_upload_document_created().
        if not attrs.get('credit_case') and not attrs.get('customer'):
            raise serializers.ValidationError(
                'You must provide a credit_case and/or a customer field.'
            )

        # Both FKs are optional and independent, so a user belonging to more than one
        # organization could otherwise link a document to a customer in org A and a
        # credit case in org B, leaving one row visible from two tenants (the
        # organization_scoped_fields check on UploadDocumentViewSet only guarantees
        # each FK *individually* belongs to one of the user's orgs, not that they
        # belong to the SAME one).
        customer = attrs.get('customer')
        credit_case = attrs.get('credit_case')
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


class DocumentDataExtractSerializer(serializers.HyperlinkedModelSerializer):
    upload_document = serializers.HyperlinkedRelatedField(
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


class LabelSerializer(serializers.HyperlinkedModelSerializer):
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
    organization = serializers.HyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ORGANIZATION_BASENAME}-detail',
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


class LabelValueSerializer(serializers.HyperlinkedModelSerializer):
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
