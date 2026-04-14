from django.db import transaction
from rest_framework import serializers

from core.constants import (
    ACCOUNT_APPLICATION_BASENAME,
    ACCOUNT_APPLICATION_ID,
    ACCOUNT_BASENAME,
)
from processing.models import AccountApplication

from .models import UploadDocument


class UploadDocumentSerializer(serializers.HyperlinkedModelSerializer):
    account_application_id = serializers.IntegerField(write_only=True)  # TODO will remove this field, since can link to acct app through request user_acct_apps; no need to include in read responses, since already have a m2m list, just need upon creation/update
    files = serializers.ListField(
        child=serializers.FileField(),
        write_only=True,
        allow_empty=False,
    )  # this is basically a container for the file field, use it to create multiple files in single request
    account_applications = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name=f'{ACCOUNT_APPLICATION_BASENAME}-detail',
    )
    accounts = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name=f'{ACCOUNT_BASENAME}-detail',
    )

    class Meta:
        model = UploadDocument
        fields = [
            'url',
            'id',
            'uploaded_at',
            'original_title',
            'files',
            'file',
            'friendly_file_name',
            'file_type_name',
            'mimetype',
            'extracted_data',
            'account_applications',
            'accounts',
            'account_application_id',
        ]
        read_only_fields = [
            'original_title',
            'uploaded_at',
            'mimetype',
            'file',
            'friendly_file_name',
            'file_type_name',
            'extracted_data',
        ]

    def validate(self, attrs):
        # TODO change this when switching to request.user functionality
        acct_app_id = attrs.get(ACCOUNT_APPLICATION_ID, None)

        if not acct_app_id:
            raise serializers.ValidationError(f'You must provide an {ACCOUNT_APPLICATION_ID} field.')

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        """
        Create the UploadDocument object, link to an AccountApplication object.

        Must be linked to either an AccountApplication object
        or an Account object or both.

        Return the UploadDocument db object.
        """

        acct_app_id = validated_data.pop(ACCOUNT_APPLICATION_ID)  # TODO prob extract this from frontend request context or something
        files = validated_data.pop('files')

        acct_app = AccountApplication.objects.filter(id=acct_app_id).first()  # prob safer than just straight .get()
        if not acct_app:
            raise serializers.ValidationError(
                f'Invalid {ACCOUNT_APPLICATION_ID}.'
            )

        created_docs = []
        for f in files:
            # Create UploadDocument (only if it contains relation to parent model) and update related AccountApplication with UploadDocument
            doc = UploadDocument.objects.create(**validated_data, file=f)  # validated_data for now just includes acct app id..

            # Add the UploadDocument to the account application's upload_documents
            acct_app.upload_documents.add(doc)
            created_docs.append(doc)

        return created_docs
