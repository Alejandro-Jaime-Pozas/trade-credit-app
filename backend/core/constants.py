FILE_UPLOAD_MAX_SIZE_MB=20  # called on serializer's validate method, not model


# Loan: required file type names
LOAN_FILE_TYPE_NAMES_REQUIRED={
    # # Financials
    # 'bank_statement',
    # 'balance_sheet',
    'cashflow_statement',
    # 'income_statement',
    # # Legal
    # 'constancia_de_situacion_fiscal',  # TODO later perhaps create this as separate set
}
# Loan: required file_type_name month requirement mappings
LOAN_FILE_MONTHS_REQUIRED_FINANCIALS={
    'bank_statement': 12,
    'balance_sheet': 1,
    'cashflow_statement': 12,
    'income_statement': 12,
}
LOAN_FILE_MONTHS_REQUIRED_LEGAL={
    'constancia_de_situacion_fiscal': 1,
}

# All allowed file type names
UPLOAD_DOCUMENT_FILE_TYPE_NAMES={
    'unknown',
}
UPLOAD_DOCUMENT_FILE_TYPE_NAMES.update(LOAN_FILE_TYPE_NAMES_REQUIRED)

# Min required months back from current date to satisfy file requirement; files before this date do not count
MAX_FILE_MONTHS_BACK_FINANCIALS=2
MAX_FILE_MONTHS_BACK_LEGAL=3


# Allowed file extensions
ALLOWED_FILE_EXTENSIONS=[
    'pdf',
    'jpg',
    'jpeg',
    'png',
    'txt',
    'csv',
    'xml',
    'json',
    'docx',
    'xlsx',
    'pptx',
]


# Router basenames - TIP: DON'T CHANGE SINCE HYPERLINKED SERIALIZER REQUIRES EXACT NAME AS MODEL NAME LOWERCASE; can override this with viewname in serializers but not required for now
## banking
ACCOUNT_BASENAME='account'
CHECKING_ACCOUNT_BASENAME='checkingaccount'
LOAN_ACCOUNT_BASENAME='loanaccount'
TRANSACTION_BASENAME='transaction'

## identity
USER_BASENAME='user'
COMPANY_BASENAME='company'

## processing
ACCOUNT_APPLICATION_BASENAME='accountapplication'
LOAN_ACCOUNT_APPLICATION_BASENAME='loanaccountapplication'
LOAN_VERDICT_BASENAME='loanverdict'
LOAN_VERDICT_AI_BASENAME='loanverdictai'
LOAN_AGREEMENT_DOCUMENT_BASENAME='loanagreementdocument'
BURO_DE_CREDITO_REPORT_BASENAME='burodecreditoreport'

## storage
UPLOAD_DOCUMENT_BASENAME='uploaddocument'


# Naming conventions for model ids
ACCOUNT_APPLICATION_ID='account_application_id'


# Mappings for file_type_names to pydantic models
from integrations.openai.services.pydantic_models.file_type_models import *  # this to avoid circular import
FILE_TYPE_NAME_MAPPING_PYDANTIC={
    # Financials
    'balance_sheet': BalanceSheetPydantic,
    'bank_statement': BankStatementPydantic,
    'cashflow_statement': CashflowStatementPydantic,
    'income_statement': IncomeStatementPydantic,
    # Legal
    'constancia_de_situacion_fiscal': ConstanciaDeSituacionFiscalPydantic,
    # Extra
    'unknown': UnknownFileDataPydantic,
}
