import datetime

from django.core.files.uploadedfile import SimpleUploadedFile

from storage.choices_for_models import FileTypeName
from processing.choices_for_models import (
    ApplicationStatus,
    LoanVerdictStatus,
)
from banking.choices_for_models import (
    PaymentInterval,
)


# Constant default defintions FOR USE IN GLOBAL TESTS

## MODEL DATA

TEST_USER_DATA = {
    'email': 'def_test83725y3hhgdsy82393@example.com',
}

TEST_COMPANY_DATA = {
    'name': 'Def_example',
    'email_domain': 'def_example.com',
}

TEST_ACCOUNT_DATA = {
    'number': '00000000001',
    'clabe': '000000000000000001',
    'type': 'checking',
    # 'name': 'Def_example Sol Checking',
    'current_balance': 100,
}

TEST_CHECKING_ACCOUNT_DATA = {
    'debit_card_number': '0000000000000001',
    'debit_card_expiration_date': datetime.datetime.today(),
}

TEST_TRANSACTION_DATA = {
    'amount': 150.43,
}

TEST_LOAN_ACCOUNT_DATA = {
    'remaining_balance': 175_000.00,
    'paid_balance': 25_000.00,
    'payment_type': 'variable',
    'payment_amount': 5_000.00,
    'payment_interval': PaymentInterval.WEEKLY,
    # 'next_payment_date': None,  # auto-calculated with save() method
}

TEST_ACCOUNT_APPLICATION_DATA = {
    'status': ApplicationStatus.PENDING_USER_DATA_UPLOAD,
    'type': 'checking',
}

TEST_LOAN_ACCOUNT_APPLICATION_DATA = {
    'annual_revenue_ttm': 10_000_000,
    'annual_expenses_ttm': 9_000_000,
}

TEST_UPLOADED_FILE = SimpleUploadedFile(
    'mod_test.pdf',
    b'mod dummy file content',
    content_type='application/pdf',
)

# Create random test uploaded file for non-repeat use
def make_test_uploaded_file():
    return SimpleUploadedFile(
        'mod_test.pdf',
        b'mod dummy file content',
        content_type='application/pdf',
    )

TEST_UPLOAD_DOCUMENT_DATA = {
    'original_title': 'def_title',  # later check if titles include ext
    'file': TEST_UPLOADED_FILE,
    'file_type_name': FileTypeName.CASHFLOW_STATEMENT,
    'mimetype': 'application/pdf',
}

TEST_LOAN_AGREEMENT_FILE = SimpleUploadedFile(
    'mod_test_loan_agreement.pdf',
    b'mod dummy file content',
    content_type='application/pdf',
)

TEST_LOAN_AGREEMENT_DOCUMENT_DATA = {
    # 'file': TEST_LOAN_AGREEMENT_FILE,
}

TEST_LOAN_VERDICT_DATA = {
    'status': LoanVerdictStatus.APPROVED,
    'principal': 1_000_000,
    'interest_rate': 0.125,
    'payment': 45_000,
    'term': 24,
}

TEST_LOAN_VERDICT_AI_DATA = {
    'status': LoanVerdictStatus.APPROVED,
    'loan_amount': 1_000_000,
    'annual_interest_rate': 0.125,
    'payment_amount': 76_783.90,
    'term_months': 60,
    'analysis_summary': """
        Decision rationale: The 12-month cash flow for Domus shows consistent positive net cash flow (Total inflows MXN 4,455,000 vs Total outflows MXN 3,220,000; Net cash flow MXN 1,235,000) with an ending cash balance of MXN 1,385,000, indicating ample liquidity to support modest debt service. The combination of solid liquidity, improving cash generation, and a debt service burden within existing cash flow capacity supports approval under these terms, as long as the company keeps its past track record and maintains it's cashflow position or improves it.
    """,
}


## SERIALIZER DATA

TEST_SRLZ_ACCOUNT_APPLICATION_DATA = {
    **TEST_ACCOUNT_APPLICATION_DATA,
    'loan_account_application': {
        **TEST_LOAN_ACCOUNT_APPLICATION_DATA,
    }
}
