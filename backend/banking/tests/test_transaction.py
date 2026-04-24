from django.db.utils import IntegrityError
from django.test import TestCase

from banking.models import (
    Transaction,
)

from core.tests.constants_global import (
    TEST_TRANSACTION_DATA,
)
from core.tests.obj_instances_global import (
    test_create_account_inst,
)


class TestTransactionModel(TestCase):
    """ Tests for Transaction model. """

    # - Transaction
    #   - id
    #   - amount
    #   - created_at
    #   - FK user_id
    #   - FK account_id
    #   - FK organization_id

    trx_data = TEST_TRANSACTION_DATA

    # Use setUpTestData classmethod class-level
    # Use setUp classmethod per-test
    @classmethod
    def setUpTestData(cls):
        cls.account = test_create_account_inst()
        cls.user = cls.account.users.first()
        cls.organization = cls.user.organizations.first()

    # test create transaction
    def test_create_transaction(self):
        trx = Transaction.objects.create(
            account=self.account,
            organization=self.organization,
            user=self.user,
            **self.trx_data,
        )
        self.assertIsInstance(trx, Transaction)
        self.assertEqual(trx.amount, self.trx_data['amount'])
        self.assertEqual(trx.account, self.account)

    # test FK to account
    def test_account_required(self):
        with self.assertRaises(IntegrityError):
            Transaction.objects.create(
                organization=self.organization,
                user=self.user,
                **self.trx_data,
            )

    # test FK to organization optional
    def test_organization_optional(self):
        Transaction.objects.create(
            account=self.account,
            user=self.user,
            **self.trx_data,
        )

    # test FK to user
    def test_user_required(self):
        with self.assertRaises(IntegrityError):
            Transaction.objects.create(
                organization=self.organization,
                account=self.account,
                **self.trx_data,
            )
