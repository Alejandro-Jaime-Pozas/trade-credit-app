from django.utils import timezone
from django.core.validators import FileExtensionValidator
from django.db import models

from core.choices_for_models import CurrencyName
from customers.models import Customer
from processing.services.credit_case import check_aggregate_satisfied_month_intervals
from core.constants import ALLOWED_FILE_EXTENSIONS, LOAN_FILE_TYPE_NAMES_REQUIRED
from core.str_utils import clean_account_name
from .choices_for_models import (
    CreditCaseFinalVerdict,
    CreditCaseStatus,
    RequestedTermDays,
    ApplicationStatus,
    BuroDeCreditoVerdictStatus,
    LoanVerdictStatus,
)
from identity.models import (
    User,
)


class CreditCase(models.Model):
    """
    A credit case, or solicitud de credito made by a customer seeking trade credit (net 30/60 days).

    This is created after a user creates a customer, and is linked to that customer.

    Files associated to credit case include financials, credit bureau files, and more moment-in-time files (CSF, Acta Constitutiva not included since they are more general to the customer and not specific to the credit case).
    """

    status = models.CharField(
        max_length=50,
        choices=CreditCaseStatus.choices,
        default=CreditCaseStatus.MISSING_DOCUMENTS,
        blank=True,
        help_text='Credit case status like missing docs, pending ai verdict, etc. ' \
                    'Items are in order of sequence.',
    )
    verdict = models.CharField(
        max_length=50,
        choices=CreditCaseFinalVerdict.choices,
        default=CreditCaseFinalVerdict.PENDING,
        blank=True,
        help_text='Credit case status like pending, approved, rejected. ' \
                    'Items are in order of sequence.',
    )
    requested_amount = models.DecimalField(
        max_digits=32,
        decimal_places=2,
        default=0.00,
        blank=True,
        help_text='Requested credit line amount.',
    )
    currency = models.CharField(
        max_length=10,
        choices=CurrencyName.choices,
        default=CurrencyName.MXN,
        help_text='Currency for the requested credit line amount.',
    )
    requested_term_days = models.IntegerField(
        choices=RequestedTermDays.choices,
        help_text='Requested net terms (days).',
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
    )
    updated_at = models.DateTimeField(
        auto_now=True,
    )
    submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Submitted for human approval timestamp.',
    )
    verdict_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Final verdict timestamp after human review.',
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_credit_cases',
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='credit_cases',
    )


### ========================================================
class AccountApplication(models.Model):
    """
    Any application submitted to the bank by existing or
    potentially new customer. Parent of all other Account
    Application models.

    Extra fields from sub-models such as LoanAccountApplication
    will be included and passed down into such models via serializer
    logic. Make sure these fields are not null if sub-model requires
    it.
    """

    status = models.CharField(
        max_length=50,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.PENDING_USER_DATA_UPLOAD,
        help_text='Account application status like pending, approved, rejected. ' \
                    'Items are in order of sequence.',
    )
    name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Name for the account, includes organization and/or account type',
    )
    type = models.CharField(
        max_length=50,
        default='loan',
        help_text='Specify bank account type. Checking, loan, etc.',
    )
    users = models.ManyToManyField(
        User,
        related_name='account_applications',
        blank=True,
    )
    # upload_documents m2m

    @property
    def required_file_type_names(self):
        """
        Get a set of all required file_type_name files
        for this instance's account application type.
        """
        if self.type == 'loan':
            return LOAN_FILE_TYPE_NAMES_REQUIRED
        else:
            raise ValueError(
                'Must implement code for type field other than "loan" for acct app.'
            )

    @property
    def uploaded_file_type_names(self):
        """ Get a set of all uploaded file_type_name files. """
        # this should be in related upload_documents m2m
        if self.upload_documents.first():
            return {d.file_type_name for d in self.upload_documents.all()}
        else:
            return set()

    @property
    def missing_file_type_names(self):
        # TODO include new date requirements to satisfy file requirements
        """ Get a set of all missing file_type_name files. """
        if self.required_file_type_names:
                return \
                    set(self.required_file_type_names) \
                    - set(self.uploaded_file_type_names)

    @property
    def total_missing_files(self):
        """ Get the number of missing file_type_name files. """
        if self.missing_file_type_names:
            return len(self.missing_file_type_names)
        else:
            return 0

    @property
    def all_files_required_dates_complete(self):
        """
        Get a dict of all file type names that have been uploaded along
        with the months they satisfy to meet file date requirements.
        """
        if self.type == 'loan':
            file_dates = check_aggregate_satisfied_month_intervals(
                acct_app=self,
                file_type_names=LOAN_FILE_TYPE_NAMES_REQUIRED,
            )
            try:
                data = {
                    file_type_name: {
                            d.isoformat(): value
                            for d, value in months_dict.items()
                    }
                    for file_type_name, months_dict in file_dates.items()
                }
                return data

            except Exception as e:
                return {'error': str(e)}

        else:
            return {}

    def save(self, *args, **kwargs):
        if not self.name and self.type:
            self.name = clean_account_name(type_name=self.type)

        super().save(*args, **kwargs)

    def __str__(self):
        return f'<AccountApplication|id={self.id}, name={self.name}, ' \
                f'account_application_type={self.type}, status={self.status}>'


class LoanAccountApplication(models.Model):
    """
    The application object prior to creating a Loan Account.

    Fields here are mix of user-request provided vs gpt provided.

    This object keeps data organized while the loan is processed
    prior to approving or rejecting the loan. If the loan is
    approved, then the data is used to create a LoanAccount
    object and all gathered data is passed into it or a report
    object or something like that.
    """

    annual_revenue_ttm = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Trailing twelve months organization revenue.',
    )
    annual_expenses_ttm = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Trailing twelve months organization expenses.',
    )
    account_application = models.OneToOneField(
        AccountApplication,
        on_delete=models.CASCADE,
        related_name='loan_account_application',
    )

    def __str__(self):
        return f'<LoanAccountApplication|id={self.id}, ' \
                f'name={self.account_application.name}>'


class LoanVerdict(models.Model):
    """
    Decides if loan should be approved or rejected. Creates the loan terms.
    """

    status = models.CharField(
        max_length=50,
        choices=LoanVerdictStatus.choices,
        help_text='The loan verdict response: approved or rejected.',
    )
    principal = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Total principal loan amount to grant.',
    )
    interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='The annual interest rate to be paid by the user or organization.',
    )
    payment = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='The monthly payment amount to be made by the user or organization. ' \
                    'Includes principal + interest.',
    )
    term = models.SmallIntegerField(
        null=True,
        blank=True,
        help_text='Total months for which the loan is to be repaid.',
    )
    analysis_summary = models.TextField(
        null=True,
        blank=True,
        help_text='Loan decision process analysis summary.',
    )
    passes_thresholds = models.JSONField(
        null=True,
        blank=True,
        help_text='Dict that shows if financial metrics pass thresholds ' \
                    'along with details if not.',
    )
    loan_account_application = models.ForeignKey(
        LoanAccountApplication,
        on_delete=models.CASCADE,
        related_name='loan_verdicts',
    )

    def __str__(self):
        return f'<LoanVerdict: id={self.id}, status={self.status}, ' \
                f'loan_account_application={self.loan_account_application}>'


def document_upload_to(instance, filename):
    dt = instance.created_at
    if not dt:
        dt = timezone.now()
        instance.created_at = dt
    return f'internal_documents/{dt:%Y/%m/%d}/id_{instance.id}--{filename}'


class LoanAgreementDocument(models.Model):
    """
    The loan agreement that a user will sign, represented in pdf format.
    This is directly related to an AccountApplication or an Account object.

    INFO: entirely separate from UploadDocument.
     """

    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text='Created at timestamp.',
    )
    signed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Signed at timestamp.',
    )
    file = models.FileField(
        upload_to=document_upload_to,
        validators=[
            FileExtensionValidator(ALLOWED_FILE_EXTENSIONS),
        ],
        help_text='The loan agreement pdf file (location).',
    )  # contains: name, path, size
    account_application = models.ForeignKey(
        AccountApplication,
        on_delete=models.CASCADE,
        related_name='loan_agreement_documents',
    )


class BuroDeCreditoReport(models.Model):
    """
    JSON response extracted from Buro de Credito API.

    This includes the credit score and credit history.
    """

    json_response = models.JSONField(help_text='json response returned by API.')
    score = models.IntegerField(
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=50,
        choices=BuroDeCreditoVerdictStatus.choices,
        default=BuroDeCreditoVerdictStatus.PENDING,
    )
    verdict = models.CharField(
        max_length=1024,
        null=True,
        blank=True,
    )
    account_applications = models.ManyToManyField(
        AccountApplication,
        related_name='buro_de_credito_reports',
        blank=True,
    )


class LoanVerdictAI(models.Model):
    """
    The GPT API loan response object. This is the response that GPT
    auto-generates based on text and file inputs to determine
    if a loan application is either approved or rejected.

    The data input into this model will come from a pydantic
    model used to validate the json response from GPT API.
    """

    status = models.CharField(
        max_length=50,
        choices=LoanVerdictStatus.choices,
        help_text='The loan verdict response: approved or rejected.',
    )
    loan_amount = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Total loan amount to grant to the user or organization.',
    )
    annual_interest_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='The annual interest rate to be paid by the user or organization.',
    )
    payment_amount = models.DecimalField(
        max_digits=21,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='The monthly payment amount to be made by the user or organization. ' \
                    'Includes principal + interest.',
    )
    term_months = models.SmallIntegerField(
        null=True,
        blank=True,
        help_text='Total months for which the loan is to be repaid.',
    )
    analysis_summary = models.TextField(
        null=True,
        blank=True,
        help_text='Loan decision process analysis summary.',
    )
    loan_account_application = models.ForeignKey(
        LoanAccountApplication,
        on_delete=models.CASCADE,
        related_name='loan_verdicts_ai',
    )

    def __str__(self):
        return f'<LoanVerdictAI: id={self.id}, status={self.status}, ' \
                f'loan_account_application={self.loan_account_application}>'
### =========================================================
