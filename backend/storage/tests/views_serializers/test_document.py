""" Tests for the api views and serializers. """
import shutil
import tempfile
from unittest.mock import patch
from rest_framework.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse

from rest_framework.test import APIClient
from rest_framework import status

from core.constants import (
    ACCOUNT_APPLICATION_ID,
    UPLOAD_DOCUMENT_BASENAME,
)
from core.serializer_utils import pass_into_serializer_check
from core.tests.obj_instances_global import (
    test_create_loan_account_application_inst,
)
from core.tests.constants_global import (
    TEST_UPLOAD_DOCUMENT_DATA,
    TEST_UPLOADED_FILE,
    make_test_uploaded_file,
)

from storage.models import UploadDocument
from storage.serializers import UploadDocumentSerializer


# Create a temp media dir to mock
TEMP_MEDIA_ROOT = tempfile.mkdtemp()


UPLOAD_DOCUMENT_URL = reverse(f'{UPLOAD_DOCUMENT_BASENAME}-list')

def get_detail_url(id):
    ...


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class TestPrivateUploadDocumentAPI(TestCase):
    """ Test private requests to UploadDocument API. """

    @classmethod
    def tearDownClass(cls):
        # remove the temp MEDIA_ROOT dir
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    @classmethod
    def setUpTestData(cls):
        loan_acct_app = test_create_loan_account_application_inst()
        cls.acct_app = loan_acct_app.account_application

    def setUp(self):
        self.upload_document_data = TEST_UPLOAD_DOCUMENT_DATA.copy()
        self.upload_document_data['files'] = [make_test_uploaded_file()]  # dummy file required for serializer files field
        self.upload_document_data[ACCOUNT_APPLICATION_ID] = self.acct_app.id
        self.client = APIClient()


    # SERIALIZERS

    # test serializer validated_data success
    def test_serializer_validated_data(self):
        serializer = UploadDocumentSerializer(data=self.upload_document_data)
        serializer.is_valid(raise_exception=True)
        serializer.save()


    def test_create_UploadDocument_no_account_application_field_error(self):
        self.upload_document_data.pop(ACCOUNT_APPLICATION_ID)
        serializer = UploadDocumentSerializer(data=self.upload_document_data)

        with self.assertRaises(ValidationError):
            serializer.is_valid(raise_exception=True)


    # test non-user related or null acct app error
    def test_non_user_or_null_acct_app_error(self):
        self.upload_document_data[ACCOUNT_APPLICATION_ID] = -1
        serializer = UploadDocumentSerializer(data=self.upload_document_data)
        serializer.is_valid(raise_exception=True)

        with self.assertRaises(ValidationError):
            serializer.save()


    # VIEWS

    # test create UploadDocument success
    @patch('storage.views.handle_upload_document_created', autospec=True)
    def test_create_UploadDocument(self, mock_handler):

        mock_handler.return_value = {'skipped': True}

        # create UploadDocument
        res = self.client.post(
            UPLOAD_DOCUMENT_URL,
            data=self.upload_document_data,
            format='multipart',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', res.data[0])

        doc = UploadDocument.objects.get(id=res.data[0]['id'])
        serializer = pass_into_serializer_check(UploadDocumentSerializer, doc, res)

        self.assertEqual(res.data[0], serializer.data)
        self.assertEqual(
            self.upload_document_data[ACCOUNT_APPLICATION_ID],
            doc.account_applications.get(id=self.acct_app.id).id
        )
