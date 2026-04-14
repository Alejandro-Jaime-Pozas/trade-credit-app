"""
Handles Account creation after user signs a LoanAgreementDocument.
"""

from processing.models import (
    AccountApplication,
    # LoanAgreementDocument,
)
from banking.models import Account, LoanAccount


def handle_signed_loan_agreement_doc(
    # loan_agmt_doc: LoanAgreementDocument,
    acct_app: AccountApplication,
):
    """
    Create Account and LoanAccount based on the signed
    LoanAgreementDocument and its related AccountApplication.
    """

    # Create the Account based on the AccountApplication object
        # TIP: no need to validate since all data passed in is already in db objects, not coming from http request directly
    loan_verdict = acct_app.loan_account_application.loan_verdicts_ai.first()  # TODO later fix since could be multiple loan verdicts...
    acct = Account.objects.create(
        type=acct_app.type,
        current_balance=loan_verdict.loan_amount,
        account_application=acct_app,
    )

    loan_acct = LoanAccount.objects.create(
        remaining_balance=acct.current_balance,
        payment_amount=loan_verdict.payment_amount,
        account=acct,
    )

    return acct, loan_acct
