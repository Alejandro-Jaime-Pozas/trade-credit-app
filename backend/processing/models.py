from datetime import timedelta

from django.utils import timezone
from django.contrib.contenttypes.fields import GenericRelation
from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models

from core.choices_for_models import CurrencyName
from customers.models import Customer
from processing.services.credit_case import check_aggregate_satisfied_month_intervals
from core.constants import (
    ALLOWED_FILE_EXTENSIONS,
)
from core.file_type_spec import DEFAULT_SUGGESTION_KEYS
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

    Notes:
        Since this model will be auto-created from Customer profile,
        it needs to have defaults or null=True values to be able to create
        a default CreditCase for a given Customer.
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
        null=True,
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
        null=True,
        blank=True,
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
    verdict_due_days = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text='Overrides the organization default_verdict_days for THIS case only. '
                  'Null means "use the organization default", which is the normal case - '
                  'set a value here only when one case genuinely needs longer or shorter '
                  'than the rest.',
    )
    requirements_completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='When every required document for this case had been uploaded and '
                    'classified. Stamped once, the first time it happens, as a record of '
                    'when the file requirements were satisfied. Whether the case is '
                    'complete RIGHT NOW is answered by the requirements_complete '
                    'property, which is always derived from the current documents.',
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
    # Custom field values (dynamic Labels) attached to this credit case.
    # GenericRelation so deleting a credit case cascades away its LabelValue rows too.
    label_values = GenericRelation('storage.LabelValue')

    # ---------------------------------------------------------------- deadline
    # The verdict deadline is COMPUTED, never stored. Storing it would mean keeping a
    # second copy of something already implied by created_at plus a day count, and the two
    # would eventually disagree. The trade-off accepted here: raising the organization's
    # default_verdict_days moves the deadline of every existing case with it, rather than
    # leaving old cases on the number that applied when they were opened.

    @property
    def verdict_due_days_effective(self) -> int:
        """
        How many days this particular case gets before its verdict is overdue.

        The case's own `verdict_due_days` wins when it is set; otherwise the case falls
        back to whatever its organization chose. Every credit case therefore has a
        deadline without anyone having to type one in.
        """
        if self.verdict_due_days is not None:
            return self.verdict_due_days
        return self.customer.organization.default_verdict_days

    @property
    def verdict_due_at(self):
        """
        The moment this case's verdict becomes overdue.

        Counted from `created_at`, so the clock starts as soon as the case exists and no
        case can sit in the system without a deadline. Returns None only for a case that
        has never been saved, since `created_at` is filled in on first save.
        """
        if not self.created_at:
            return None
        return self.created_at + timedelta(days=self.verdict_due_days_effective)

    @property
    def _verdict_clock_reference(self):
        """
        The point in time the day counts below are measured against.

        A case that already has a verdict stops its clock at `verdict_at`: once the
        decision is made the case is not getting later every day, and its numbers should
        stay as a record of how long it actually took. An undecided case measures against
        now.
        """
        return self.verdict_at or timezone.now()

    @property
    def days_since_created(self):
        """
        Whole days elapsed since the case was created - the "days passed" figure.

        Compared on CALENDAR DATES rather than exact timestamps, because that is what a
        person means by "3 days": a case opened late Monday is 1 day old on Tuesday
        morning, not 0.
        """
        if not self.created_at:
            return None
        return (self._verdict_clock_reference.date() - self.created_at.date()).days

    @property
    def days_until_verdict_due(self):
        """
        Whole days left before the verdict is overdue - the "days remaining" figure.

        Goes NEGATIVE once the deadline has passed, which is deliberate: one number then
        covers both "2 days left" and "3 days late", and a caller sorting by it puts the
        most overdue cases first with no special casing. Same calendar-date basis as
        `days_since_created`, so a case due today reads as 0.
        """
        due = self.verdict_due_at
        if due is None:
            return None
        return (due.date() - self._verdict_clock_reference.date()).days

    @property
    def is_verdict_overdue(self) -> bool:
        """
        Whether this case blew its deadline.

        A case that already has a verdict is judged on whether it was late WHEN IT WAS
        DECIDED (its clock stopped at verdict_at), so a case decided on time never starts
        reporting itself as overdue later on.
        """
        remaining = self.days_until_verdict_due
        return remaining is not None and remaining < 0

    @property
    def required_file_type_names(self):
        """
        Get a set of all required file_type_name files for this credit case.

        Read from this case's own CreditCaseRequirement rows (see
        storage.models.CreditCaseRequirement), which were copied from the
        organization's requirement template when the case was created. Each case
        therefore keeps its own snapshot of what was required, so later edits to the
        template can't rewrite the history of a case that's already been reviewed.

        Only requirements flagged `is_required` count — optional ones are listed for
        the user's convenience but never block a case from being complete.
        """
        return {
            requirement.file_type.key
            for requirement in self.requirements.all()
            if requirement.is_required and not requirement.is_excluded
        }

    @property
    def optional_file_type_names(self):
        """
        Get a set of the file types this case lists as nice-to-have rather than
        mandatory. These are shown alongside the required ones but are excluded from
        `missing_file_type_names`, so they never hold up completion.
        """
        return {
            requirement.file_type.key
            for requirement in self.requirements.all()
            if not requirement.is_required and not requirement.is_excluded
        }

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
    def requirements_complete(self):
        """
        Whether every required document for this case has been uploaded.

        Deliberately computed from the case's current documents rather than stored, so it
        can never disagree with reality — if a requirement is added later, this correctly
        goes back to False.

        A case with NO requirements at all counts as NOT complete: that means nobody has
        set up what this case needs yet, which is a very different situation from
        "everything we asked for has arrived".
        """
        return bool(self.required_file_type_names) and not self.missing_file_type_names

    @property
    # TODO will need to modify this to use in credit case...
    def all_files_required_dates_complete(self):
        """
        Get a dict of all file type names that have been uploaded along
        with the months they satisfy to meet file date requirements.
        """
        if self.type == 'loan':
            file_dates = check_aggregate_satisfied_month_intervals(
                acct_app=self,
                file_type_names=set(DEFAULT_SUGGESTION_KEYS),
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

    def __str__(self):
        return f'Credit Case for {self.customer.name}'


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
        # AccountApplication is the older, pre-CreditCase flow and has no per-object
        # requirement rows, so it still uses the catalog's default suggestions.
        if self.type == 'loan':
            return set(DEFAULT_SUGGESTION_KEYS)
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
                file_type_names=set(DEFAULT_SUGGESTION_KEYS),
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
