import datetime
import shutil
import tempfile

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile

from core.constants import FILE_UPLOAD_MAX_SIZE_MB
from core.tests.constants_global import TEST_UPLOAD_DOCUMENT_DATA
from core.tests.obj_instances_global import (
    test_create_account_inst,
    test_create_account_application_inst,
)
from storage.models import UploadDocument


# Create a temp media dir to mock
TEMP_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class TestUploadDocumentModel(TestCase):
    """ Test the UploadDocument model. """

    file_data = TEST_UPLOAD_DOCUMENT_DATA.copy()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        # Create minimal file
        self.file_bytes = b'dummy file content'
        self.uploaded_file = SimpleUploadedFile(
            'test.pdf',
            self.file_bytes,
            content_type=self.file_data['mimetype'],
        )

        self.data = {
            **self.file_data,
            'file': self.uploaded_file,
        }

        # Create account, application account objs
        self.acct = test_create_account_inst()
        self.acct_app = self.acct.account_application

    # test create file success
    def test_create_file(self):

        doc = UploadDocument.objects.create(
            **self.data,
        )
        # Add the optional m2m relation to acct, acct app
        doc.accounts.add(self.acct)
        doc.account_applications.add(self.acct_app)

        self.assertIsInstance(doc, UploadDocument)
        self.assertEqual(doc.original_title, self.data['original_title'])
        self.assertEqual(doc.file_type_name, self.data['file_type_name'])
        self.assertEqual(doc.mimetype, self.data['mimetype'])
        self.assertIsInstance(doc.uploaded_at, datetime.datetime)
        self.assertTrue(doc.accounts.get(id=self.acct.id))
        self.assertTrue(doc.account_applications.get(id=self.acct_app.id))

        # File checks
        self.assertTrue(doc.file)  # assert file is present
        self.assertTrue(doc.file.name.endswith(self.data['file'].name))
        self.assertEqual(doc.file.size, self.data['file'].size)

    # test file size exceeded error??
    # TODO This should be in serializer tests
    def test_file_size_exceeded_error(self):

        text_content = b'x' * ((FILE_UPLOAD_MAX_SIZE_MB + 1) * 1024 * 1024)

        big_file = SimpleUploadedFile(
            'bigfile.pdf',
            text_content,
            'application/pdf'
        )
        data_copy = self.data.copy()
        data_copy['file'] = big_file

        doc = UploadDocument.objects.create(**data_copy)  # INFO: validators aren't enforced at model level..instead at validation level in serializers

        with self.assertRaises(ValidationError):
            doc.full_clean()  # this validates the data which raises the error
