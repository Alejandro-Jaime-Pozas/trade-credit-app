import shutil
import tempfile

from django.db.utils import IntegrityError
from django.test import TestCase, override_settings
from django.core.files.base import ContentFile

from processing.models import LoanAgreementDocument
from core.tests.constants_global import (
    TEST_LOAN_AGREEMENT_DOCUMENT_DATA,
    TEST_UPLOADED_FILE as TEST_LOAN_AGREEMENT_FILE,
)
from core.tests.obj_instances_global import (
    test_create_account_application_inst,
)

# Create a temp media dir to mock
TEMP_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEMP_MEDIA_ROOT)
class TestLoanAgreementDocumentModel(TestCase):
    """ Test the LoanAgreementDocument model. """

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.loan_agmt_doc_data = TEST_LOAN_AGREEMENT_DOCUMENT_DATA.copy()
        self.acct_app = test_create_account_application_inst()

    # test create loan agmt doc model
    def test_create_loan_agreement_document_sucess(self):
        loan_agmt_doc = LoanAgreementDocument.objects.create(
            account_application=self.acct_app,
            **self.loan_agmt_doc_data,
        )

        self.assertIsInstance(loan_agmt_doc, LoanAgreementDocument)
        self.assertEqual(loan_agmt_doc.signed_at, None)
        self.assertIsNotNone(loan_agmt_doc.file)

    # test fk to acct app required
    def test_fk_to_acct_app_required(self):
        with self.assertRaises(IntegrityError):
            doc = LoanAgreementDocument.objects.create(
                **self.loan_agmt_doc_data,
            )

    # test attach pdf buffer bytes as file to db model file field
    # TIP: should ideally be replicating as much of the actual code as possible, not hard-coding
    def test_attach_pdf_bytes_to_model(self):
        pdf_bytes = b'%PDF-1.7 mod dummy file content'

        # pop the file field if exists in loan agmt doc, to create new file
        self.loan_agmt_doc_data.pop('file', None)

        doc = LoanAgreementDocument.objects.create(
            account_application=self.acct_app,
            **self.loan_agmt_doc_data,
        )

        doc.file.save(
            name='dummy_file_name.pdf',
            content=ContentFile(pdf_bytes),
            save=True,
        )

        with doc.file.open('rb') as f:
            content = f.read()

        self.assertIn('dummy_file_name.pdf', doc.file.name)
        self.assertEqual(content, pdf_bytes)
