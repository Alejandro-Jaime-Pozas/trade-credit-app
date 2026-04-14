from django.test import TestCase
from rest_framework.exceptions import ValidationError

from processing.models import AccountApplication, LoanAccountApplication
from processing.serializers import AccountApplicationSerializer
from core.tests.constants_global import TEST_SRLZ_ACCOUNT_APPLICATION_DATA


class TestAccountApplicationSerializer(TestCase):
    """
    Test the AccountApplicationSerializer logic.
    """

    def setUp(self):
        self.data = TEST_SRLZ_ACCOUNT_APPLICATION_DATA.copy()

    # test serializer create success,
    # creates both acct app and loan acct app models
    def test_acct_app_serializer_create_loan(self):
        payload = self.data
        payload['type'] = 'loan'

        serializer = AccountApplicationSerializer(data=payload)
        serializer.is_valid(raise_exception=True)  # data should be valid
        acct_app = serializer.save()

        self.assertEqual(acct_app.type, 'loan')
        self.assertIsInstance(acct_app, AccountApplication)
        self.assertIsInstance(acct_app.loan_account_application, LoanAccountApplication)

    # test create serializer for checking acct app error
    # TODO implement same functionality as loan for checking...
    def test_acct_app_serializer_create_checking_error(self):
        payload = self.data
        payload['type'] = 'checking'

        serializer = AccountApplicationSerializer(data=payload)
        serializer.is_valid(raise_exception=True)

        # TODO change when implemented checking logic
        with self.assertRaises(ValidationError):
            serializer.save()
