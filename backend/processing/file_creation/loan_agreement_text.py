
# PDF-ready (plain text) one-page loan agreement template.
# Use this string as the content you render into your PDF.

from decimal import ROUND_HALF_UP, Decimal
from django.utils import timezone
from dateutil.relativedelta import relativedelta


effective_date = timezone.now().date()
# Last day of the next month
first_payment_date = (
    effective_date
    + relativedelta(months=2, day=1)
    - relativedelta(days=1)
)
grace_period_days = 5

# Quantize the decimal
def get_late_fee(payment):
    return (
        payment * Decimal("0.03")).quantize(Decimal("0.01"),
        rounding=ROUND_HALF_UP
    )


# This does not guarantee the last day of the month
def get_maturity_date(first_payment_date, term):
    return (
        first_payment_date
        + relativedelta(months=term)
    )


def get_loan_agreement_text(
    *,
    principal: float,
    interest_rate: float,
    term: int,
    payment: float,
    **_,
):

    LOAN_AGREEMENT_TEXT = f"""\

    This Loan Agreement (“Agreement”) is made and entered into as of {effective_date} (“Effective Date”) with the following terms:

    1) LOAN AMOUNT
    Lender agrees to loan Borrower the principal sum of ${principal:,.2f} (“Loan”).

    2) INTEREST
    Interest shall accrue on the unpaid principal balance at an annual rate of {interest_rate:.4%} (the “Annual Interest Rate”), calculated on a 365-day basis, simple interest unless otherwise required by applicable law.

    3) TERM
    The term of this Loan is {term} months, beginning on {first_payment_date}, and ending on {get_maturity_date(first_payment_date, term)} (“Maturity Date”), unless paid earlier.

    4) PAYMENTS
    Borrower agrees to pay Lender ${payment:,.2f} per month (“Monthly Payment”), due on the last day of each month, starting {first_payment_date}, until the Loan (including principal and accrued interest) is paid in full. Payments shall be applied first to accrued interest and then to principal.

    5) PREPAYMENT
    Borrower may prepay all or any portion of the outstanding balance at any time without penalty. Any partial prepayment will first be applied to accrued interest, then principal.

    6) LATE FEES (OPTIONAL)
    If a Monthly Payment is not received within {grace_period_days} business days after its due date, Borrower agrees to pay a late fee of ${get_late_fee(payment):,.2f}.

    7) DEFAULT
    Borrower will be in default if: (a) any payment is more than 5 days late; or (b) Borrower materially breaches this Agreement. Upon default, Lender may declare the entire unpaid principal and accrued interest immediately due and payable, subject to applicable law.

    9) ENTIRE AGREEMENT
    This Agreement contains the entire understanding between the parties and supersedes all prior discussions. Any amendment must be in writing and signed by both parties.

    10) ELECTRONIC SIGNATURES
    The parties agree that electronic signatures and electronic records are intended to be legally binding to the fullest extent permitted by law. Each party represents that they have authority to enter into this Agreement.

    """

    return LOAN_AGREEMENT_TEXT


# LOAN AGREEMENT EXTENDED VERSION FOR FUTURE IMPLEMENTATION

# LOAN_AGREEMENT_TEXT = f"""\
# BASIC LOAN AGREEMENT (ONE-PAGE)

# This Loan Agreement (“Agreement”) is made and entered into as of {agreement_date} (“Effective Date”)
# by and between:

# Lender: {lender_name} (“Lender”)
# Borrower: {borrower_name} (“Borrower”)

# 1) LOAN AMOUNT
# Lender agrees to loan Borrower the principal sum of ${principal:,.2f} (“Loan”).

# 2) INTEREST
# Interest shall accrue on the unpaid principal balance at an annual rate of {interest_rate:.4%}
# (the “Annual Interest Rate”), calculated on a 365-day basis, simple interest unless otherwise required
# by applicable law.

# 3) TERM
# The term of this Loan is {term} months, beginning on {first_payment_date}, and ending on
# {maturity_date} (“Maturity Date”), unless paid earlier.

# 4) PAYMENTS
# Borrower agrees to pay Lender ${payment:,.2f} per month (“Monthly Payment”), due on the
# {payment_day_of_month}{payment_day_suffix} day of each month, starting {first_payment_date}, until the
# Loan (including principal and accrued interest) is paid in full.
# Payments shall be applied first to accrued interest and then to principal.

# 5) PREPAYMENT
# Borrower may prepay all or any portion of the outstanding balance at any time without penalty.
# Any partial prepayment will first be applied to accrued interest, then principal.

# 6) LATE FEES (OPTIONAL)
# If a Monthly Payment is not received within {grace_period_days} days after its due date, Borrower
# agrees to pay a late fee of ${late_fee_amount:,.2f}.

# 7) DEFAULT
# Borrower will be in default if: (a) any payment is more than {default_days_past_due} days late; or
# (b) Borrower materially breaches this Agreement.
# Upon default, Lender may declare the entire unpaid principal and accrued interest immediately due
# and payable, subject to applicable law.

# 8) GOVERNING LAW
# This Agreement will be governed by the laws of the State/Province of {governing_law_region}, without
# regard to conflict of laws principles.

# 9) ENTIRE AGREEMENT
# This Agreement contains the entire understanding between the parties and supersedes all prior
# discussions. Any amendment must be in writing and signed by both parties.

# 10) ELECTRONIC SIGNATURES
# The parties agree that electronic signatures and electronic records are intended to be legally binding
# to the fullest extent permitted by law. Each party represents that they have authority to enter into
# this Agreement.

# SIGNATURES

# LENDER:
# Signature: _______________________________   Name: {lender_name}
# Date: {agreement_date}

# BORROWER:
# Signature: _______________________________   Name: {borrower_name}
# Date: {agreement_date}
# """
