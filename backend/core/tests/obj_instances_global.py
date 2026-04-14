import datetime

from django.core.files.uploadedfile import SimpleUploadedFile

from storage.models import (
    UploadDocument,
)
from storage.choices_for_models import (
    FileTypeName,
)
from processing.models import (
    AccountApplication,
    LoanAccountApplication,
    LoanVerdict,
    LoanVerdictAI,
)
from processing.choices_for_models import ApplicationStatus, LoanVerdictStatus
from banking.models import (
    Account,
    CheckingAccount,
)
from identity.models import (
    User,
    Company,
)


# Constant default defintions FOR USE ONLY IN THIS MODULE

# User
_MOD_USER_DATA = {
    'email': 'mod_test83725y3hhgdsy82393@example.com',
}

# Company
_MOD_COMPANY_DATA = {
    'name': 'Mod_example',
    'email_domain': 'mod_example.com',
}

# Account
_MOD_ACCOUNT_DATA = {
    'number': '00000000002',
    'clabe': '000000000000000002',
    'type': 'checking',
    'name': 'Mod_example Sol Checking',
    'current_balance': 100,
}

# Checking Account
_MOD_CHECKING_ACCOUNT_DATA = {
    'debit_card_number': '0000000000000002',
    'debit_card_expiration_date': datetime.datetime.today(),
}

# Account Application
_MOD_ACCOUNT_APPLICATION_DATA = {
    'status': ApplicationStatus.PENDING_USER_DATA_UPLOAD,
    'type': 'loan',
}

# Loan Account
_MOD_LOAN_ACCOUNT_APPLICATION_DATA = {
    'annual_revenue_ttm': 1_000_000,
    'annual_expenses_ttm': 900_000,
}

# # UploadDocument
# # Create minimal file
# _MOD_UPLOADED_FILE = SimpleUploadedFile(
#     'mod_test.pdf',
#     b'mod dummy file content',
#     content_type='application/pdf',
# )
_MOD_UPLOAD_DOCUMENT_DATA = {
    'original_title': 'mod_title',
    # 'file': _MOD_UPLOADED_FILE,
    'file_type_name': FileTypeName.CASHFLOW_STATEMENT,
    'mimetype': 'application/pdf',
}

# Loan Verdict AI
_MOD_LOAN_VERDICT_AI_DATA = {
    'status': LoanVerdictStatus.APPROVED,
    'loan_amount': 10_000_000,
    'annual_interest_rate': 0.12,
    'payment_amount': 350_000,
    'term_months': 36,
    'analysis_summary': 'Applicant is able to pay back loan.',
}

# Loan Verdict
_MOD_LOAN_VERDICT_DATA = {
    'status': LoanVerdictStatus.APPROVED,
    'principal': 10_000_000,
    'interest_rate': 0.12,
    'payment': 350_000,
    'term': 36,
    'analysis_summary': 'Applicant is able to pay back loan.',
}


# User

def test_create_user_inst(email: str = _MOD_USER_DATA['email']):
    """
    Creates a default user with these values for testing:

    Args:
        email (str): 'mod_test83725y3hhgdsy82393@example.com'

    Returns: User object
    """
    user = User.objects.create_user(
        **_MOD_USER_DATA,
    )
    return user

def test_create_user_inst_with_company(email: str = _MOD_USER_DATA['email']):
    """
    Creates a default user with these values for testing:

    Args:
        email (str): 'mod_test83725y3hhgdsy82393@example.com'

    Returns: User object
    """
    user = User.objects.create_user(
        **_MOD_USER_DATA,
    )
    company = Company.objects.create(
        **_MOD_COMPANY_DATA,
    )
    user.companies.add(company)
    return user


# Company

def test_create_company_with_user_inst():
    """
    'name': 'Mod_example',
    'email_domain': 'mod_example.com',
    """
    company = Company.objects.create(
        **_MOD_COMPANY_DATA,
    )
    user = test_create_user_inst()
    company.users.add(user)
    return company


# Account

def test_create_account_inst():
    """
    'number': '00000000002',
    'clabe': '000000000000000002',
    'type': 'checking',
    'name': 'Mod_example Sol Checking',
    'current_balance': 100,
    """
    app_acct = test_create_account_application_inst()
    acct = Account.objects.create(
        account_application=app_acct,
        **_MOD_ACCOUNT_DATA,
    )
    user = app_acct.users.first()
    acct.users.add(user)  # user with company. don't remove, since acct can have many users while acct_app prob just one for the application process..
    return acct


# Checking Account

def test_create_checking_account_inst():
    """
    'debit_card_number': '0000000000000002',
    'debit_card_expiration_date': datetime.datetime.today(),
    """
    chk_acct = CheckingAccount.objects.create(
        acct=test_create_account_inst(),
        **_MOD_CHECKING_ACCOUNT_DATA,
    )
    return chk_acct


# Account Application

def test_create_account_application_inst():
    """
    'status': ApplicationStatus.PENDING_USER_DATA_UPLOAD,
    'type': 'checking',
    """
    acct_app = AccountApplication.objects.create(
        **_MOD_ACCOUNT_APPLICATION_DATA,
    )
    user = test_create_user_inst_with_company()  # user with company
    acct_app.users.add(user)
    return acct_app


# Loan Account Application

def test_create_loan_account_application_inst():
    acct_app = test_create_account_application_inst()
    loan_acct_app = LoanAccountApplication.objects.create(
        account_application=acct_app,
        **_MOD_LOAN_ACCOUNT_APPLICATION_DATA,
    )
    return loan_acct_app


# UploadDocument

def test_create_UploadDocument_inst():
    doc = UploadDocument.objects.create(
        **_MOD_UPLOAD_DOCUMENT_DATA,
    )
    return doc


# LoanVerdictAI

def test_create_loan_verdict_ai_inst():
    loan_acct_app = test_create_loan_account_application_inst()
    loan_verdict_ai = LoanVerdictAI.objects.create(
        loan_account_application=loan_acct_app,
        **_MOD_LOAN_VERDICT_AI_DATA,
    )
    return loan_verdict_ai


# LoanVerdict

def test_create_loan_verdict_inst():
    loan_acct_app = test_create_loan_account_application_inst()
    loan_verdict_obj = LoanVerdict.objects.create(
        loan_account_application=loan_acct_app,
        **_MOD_LOAN_VERDICT_DATA,
    )
    return loan_verdict_obj
