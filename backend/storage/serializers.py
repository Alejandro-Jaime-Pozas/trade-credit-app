from django.db import transaction
from rest_framework import serializers

from core.constants import (
    CREDIT_CASE_BASENAME,
    CUSTOMER_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
    CREDIT_CASE_ID,
)
from processing.models import CreditCase

from .models import DocumentDataExtract, Label, UploadDocument


class UploadDocumentSerializer(serializers.HyperlinkedModelSerializer):
    # # TODO later with frontend ready uncomment this below to allow multi file uploads
    # files = serializers.ListField(
    #     child=serializers.FileField(),
    #     write_only=True,
    #     allow_empty=False,
    # )  # this is basically a container for the file field, use it to create multiple files in single request

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
        # # TODO change this when switching to request.user functionality
        # credit_case_id = attrs.get(CREDIT_CASE_ID, None)

        # if not credit_case_id:
        #     raise serializers.ValidationError(f'You must provide a {CREDIT_CASE_ID} field.')

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """
        Create the UploadDocument object(s), link to an CreditCase object.

        Must be linked to either an CreditCase object
        or an Account object or both.

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
    class Meta:
        model = Label
        fields = [
            'url',
            'id',
            'name',
            'value',
            'created_at',
            'credit_cases',
            'customers',
        ]
