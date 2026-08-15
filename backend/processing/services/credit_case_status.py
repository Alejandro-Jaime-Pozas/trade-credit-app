"""
Moving a credit case forward once its required documents are all in.

Called after a document is uploaded and classified (see
`storage/services/db_object_handling.py`), because classification is the moment a file
starts counting toward a requirement — an unclassified upload satisfies nothing.
"""

from django.db import transaction
from django.utils import timezone

from core.constants import CREDIT_CASE_AI_VERDICT_ENABLED
from processing.choices_for_models import CreditCaseStatus


def next_status_after_requirements_complete():
    """
    Where a case should go once its documents are all in.

    Straight to human review when the AI verdict process isn't running, rather than
    parking the case in PENDING_AI_VERDICT where nothing would ever pick it up. See
    CREDIT_CASE_AI_VERDICT_ENABLED for why it is currently off.
    """
    if CREDIT_CASE_AI_VERDICT_ENABLED:
        return CreditCaseStatus.PENDING_AI_VERDICT
    return CreditCaseStatus.PENDING_FINAL_VERDICT


@transaction.atomic
def handle_requirements_progress(credit_case):
    """
    Record that a case's required documents are complete, and advance it if appropriate.

    Two separate things happen here, deliberately kept apart:

    1. `requirements_completed_at` is stamped the first time the case has everything.
       This is a record of WHEN the requirements were met and is never un-stamped — a
       requirement added later makes `requirements_complete` False again, but does not
       erase the fact that the case was once satisfied.

    2. The status advances ONLY from MISSING_DOCUMENTS. A case that has moved on — into
       review, rejected by buró, or already decided — is left exactly where it is.
       Uploading one more document must never drag a case backwards or forwards through
       the pipeline behind a reviewer's back.

    Safe to call after every upload: it does nothing until the case is actually complete,
    and nothing again on later uploads once it has advanced.

    Returns True if anything was written, False otherwise.
    """
    if credit_case is None or not credit_case.requirements_complete:
        return False

    fields = []

    if credit_case.requirements_completed_at is None:
        credit_case.requirements_completed_at = timezone.now()
        fields.append('requirements_completed_at')

    if credit_case.status == CreditCaseStatus.MISSING_DOCUMENTS:
        credit_case.status = next_status_after_requirements_complete()
        fields.append('status')

    if not fields:
        return False

    credit_case.save(update_fields=fields)
    return True


# Statuses a case may be pulled BACK from when a user deliberately adds a requirement.
# Everything else is left alone: a case rejected by buró or already decided is finished,
# and dragging it back into "missing documents" would misrepresent where it stands.
REVERTIBLE_STATUSES = (
    CreditCaseStatus.PENDING_AI_VERDICT,
    CreditCaseStatus.PENDING_FINAL_VERDICT,
)


@transaction.atomic
def handle_manual_requirement_change(credit_case):
    """
    Recalculate a case's status after a USER changed its requirements by hand.

    This is deliberately more aggressive than `handle_requirements_progress`, which only
    ever moves a case forward:

      - adding a requirement to a case that was waiting for a verdict pulls it BACK to
        MISSING_DOCUMENTS, because someone has explicitly said this case needs more
        before it can be judged.
      - removing the requirement that was holding a case up advances it, exactly as
        uploading the missing document would have.

    Template re-syncs keep the gentler behaviour on purpose (see
    `apply_template_to_case`): those are bulk, indirect changes to many cases at once,
    and should never reshuffle a reviewer's queue behind their back. A user editing one
    specific case is making a direct, considered decision about that case.

    Returns True if the status changed.
    """
    if credit_case is None:
        return False

    if credit_case.requirements_complete:
        # Same forward move as finishing the uploads, including the completion stamp.
        return handle_requirements_progress(credit_case)

    if credit_case.status in REVERTIBLE_STATUSES:
        credit_case.status = CreditCaseStatus.MISSING_DOCUMENTS
        credit_case.save(update_fields=['status'])
        return True

    return False
