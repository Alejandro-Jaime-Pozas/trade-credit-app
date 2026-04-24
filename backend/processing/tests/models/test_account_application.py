from django.test import TestCase

from core.constants import (
    LOAN_FILE_TYPE_NAMES_REQUIRED,
)
from processing.models import AccountApplication
from core.tests.constants_global import (
    TEST_ACCOUNT_APPLICATION_DATA,
)
from core.tests.obj_instances_global import (
    test_create_UploadDocument_inst,
    test_create_user_inst_with_organization
)
from core.str_utils import clean_account_name


class TestAccountApplicationModel(TestCase):
    """ Test the AccountApplication model. """

    account_application_data = TEST_ACCOUNT_APPLICATION_DATA

    # test create acct app model
    def test_create_account_application(self):

        acct_app = AccountApplication.objects.create(
            **self.account_application_data,
        )
        user = test_create_user_inst_with_organization()
        acct_app.users.add(user)
        self.assertIsInstance(acct_app, AccountApplication)
        self.assertEqual(acct_app.status, self.account_application_data['status'])
        self.assertEqual(acct_app.type, self.account_application_data['type'])
        self.assertEqual(acct_app.users.get(id=user.id), user)
        self.assertEqual(
            acct_app.name,
            clean_account_name(
                type_name=self.account_application_data['type']
            )
        )

    # test acct app properties if at least 1 UploadDocument uploaded
    def test_account_application_properties_at_least_1_UploadDocument(self):

        # create acct app
        acct_app = AccountApplication.objects.create(
            **self.account_application_data,
        )
        acct_app.type = 'loan'
        acct_app.save()

        # create UploadDocument and add to acct app
        doc = test_create_UploadDocument_inst()
        acct_app.upload_documents.add(doc)

        # test required_file_type_names
        self.assertEqual(
            acct_app.required_file_type_names,
            LOAN_FILE_TYPE_NAMES_REQUIRED if acct_app.type == 'loan' else None
        )
        # test uploaded_file_type_names
        self.assertEqual(
            acct_app.uploaded_file_type_names,
            {d.file_type_name for d in acct_app.upload_documents.all()}
        )
        # missing_file_type_names
        self.assertEqual(
            acct_app.missing_file_type_names,
            set(acct_app.required_file_type_names) \
            - set(acct_app.uploaded_file_type_names)
        )
        # total_missing_files
        self.assertEqual(
            acct_app.total_missing_files,
            len(acct_app.missing_file_type_names)
        )

    # test acct app properties if no upload_documents uploaded
    def test_account_application_properties_no_upload_documents(self):

        # create acct app
        acct_app = AccountApplication.objects.create(
            **self.account_application_data,
        )
        acct_app.type = 'loan'
        acct_app.save()

        # test required_file_type_names
        self.assertEqual(
            acct_app.required_file_type_names,
            LOAN_FILE_TYPE_NAMES_REQUIRED if acct_app.type == 'loan' else None
        )
        # test uploaded_file_type_names
        self.assertEqual(
            acct_app.uploaded_file_type_names,
            set()
        )
        # missing_file_type_names
        self.assertEqual(
            acct_app.missing_file_type_names,
            set(acct_app.required_file_type_names) \
            - set(acct_app.uploaded_file_type_names)
        )
        # total_missing_files
        self.assertEqual(
            acct_app.total_missing_files,
            len(acct_app.missing_file_type_names)
        )
