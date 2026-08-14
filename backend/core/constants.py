FILE_UPLOAD_MAX_SIZE_MB=20  # called on serializer's validate method, not model


# File type names, month requirements, extraction schemas and recency limits all now
# live in ONE place: core/file_type_catalog.py (derived lookups in core/file_type_spec.py).
# Add a new file type to the catalog, not here.
# (This block previously held CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED,
# UPLOAD_DOCUMENT_FILE_TYPE_NAMES, LOAN_FILE_MONTHS_REQUIRED_* and
# MAX_FILE_MONTHS_BACK_*, which all had to be kept in sync by hand.)


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

# Extensions that OpenAI's file-upload "context stuffing" (input_file) can't read;
# these must be uploaded with purpose='vision' and sent as input_image instead.
IMAGE_FILE_EXTENSIONS=[
    'jpg',
    'jpeg',
    'png',
]


# Router basenames - TIP: DON'T CHANGE SINCE HYPERLINKED SERIALIZER REQUIRES EXACT NAME AS MODEL NAME LOWERCASE; can override this with viewname in serializers but not required for now
## banking
ACCOUNT_BASENAME='account'
CHECKING_ACCOUNT_BASENAME='checkingaccount'
LOAN_ACCOUNT_BASENAME='loanaccount'
TRANSACTION_BASENAME='transaction'

## identity
USER_BASENAME='user'
ORGANIZATION_BASENAME='organization'

##
CUSTOMER_BASENAME='customer'
CUSTOMER_CONTACT_BASENAME='customercontact'

## processing
CREDIT_CASE_BASENAME='creditcase'
ACCOUNT_APPLICATION_BASENAME='accountapplication'
LOAN_ACCOUNT_APPLICATION_BASENAME='loanaccountapplication'
LOAN_VERDICT_BASENAME='loanverdict'
LOAN_VERDICT_AI_BASENAME='loanverdictai'
LOAN_AGREEMENT_DOCUMENT_BASENAME='loanagreementdocument'
BURO_DE_CREDITO_REPORT_BASENAME='burodecreditoreport'

## storage
UPLOAD_DOCUMENT_BASENAME='uploaddocument'
DOCUMENT_DATA_EXTRACT_BASENAME='documentdataextract'
LABEL_BASENAME='label'
LABEL_VALUE_BASENAME='labelvalue'
FILE_TYPE_BASENAME='filetype'
REQUIREMENT_TEMPLATE_BASENAME='requirementtemplate'
REQUIREMENT_TEMPLATE_ITEM_BASENAME='requirementtemplateitem'
CREDIT_CASE_REQUIREMENT_BASENAME='creditcaserequirement'


# Models that can have dynamic custom fields (Label/LabelValue) attached, and the ORM
# lookup path(s) from that model back to Organization, used to enforce tenant isolation
# when a LabelValue is created (a target object must be reachable via at least one path).
LABELABLE_MODEL_ORG_LOOKUPS={
    'creditcase': ['customer__organization'],
    'customer': ['organization'],
    'uploaddocument': ['customer__organization', 'credit_case__customer__organization'],
}


# Naming conventions for model ids
CREDIT_CASE_ID='credit_case_id'


# file_type_name -> pydantic extraction model now lives in core/file_type_spec.py
# as PYDANTIC_BY_KEY, derived from the core/file_type_catalog.py entries.
