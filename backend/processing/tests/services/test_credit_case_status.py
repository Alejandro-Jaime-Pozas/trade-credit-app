"""
Tests for advancing a credit case once its required documents are all uploaded.

Two behaviours matter most here and are easy to regress:

  - a case only ever advances OUT OF `missing_documents`. Uploading one more document
    to a case already in review, rejected, or decided must not move it.
  - where it advances TO depends on whether the AI verdict process is actually running.
    Parking a case in `pending_ai_verdict` when nothing consumes that status would strand
    it forever.
"""

import pytest
from unittest.mock import patch

from customers.models import Customer
from identity.models import Organization
from processing.models import CreditCase
from processing.services.credit_case_status import handle_requirements_progress
from storage.models import CreditCaseRequirement, FileType, UploadDocument


def make_credit_case(status='missing_documents', **kwargs):
    org = Organization.objects.create(name='Acme', email_domain='acme.com')
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    return CreditCase.objects.create(customer=customer, status=status, **kwargs)


def require(credit_case, key):
    """Give the case a requirement for one document type."""
    file_type = FileType.objects.get(key=key, organization=None)
    return CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=file_type,
    )


def upload(credit_case, key):
    """Simulate an uploaded, already-classified document of that type."""
    return UploadDocument.objects.create(
        credit_case=credit_case, file='x.pdf', file_type_name=key,
    )


@pytest.mark.django_db
def test_case_with_no_requirements_is_not_complete():
    """
    Nobody has said what this case needs yet, which is not the same as everything having
    arrived — otherwise a brand new case for an org with no template would instantly
    advance to review with zero documents.
    """
    credit_case = make_credit_case()

    assert credit_case.requirements_complete is False
    assert handle_requirements_progress(credit_case) is False
    assert credit_case.status == 'missing_documents'


@pytest.mark.django_db
def test_partially_uploaded_case_does_not_advance():
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    require(credit_case, 'balance_sheet')
    upload(credit_case, 'bank_statement')

    assert credit_case.requirements_complete is False
    assert handle_requirements_progress(credit_case) is False
    assert credit_case.status == 'missing_documents'
    assert credit_case.requirements_completed_at is None


@pytest.mark.django_db
def test_completing_requirements_stamps_and_advances_to_human_review():
    """With the AI verdict process off, a complete case goes straight to human review."""
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    upload(credit_case, 'bank_statement')

    assert credit_case.requirements_complete is True
    assert handle_requirements_progress(credit_case) is True

    credit_case.refresh_from_db()
    assert credit_case.status == 'pending_final_verdict'
    assert credit_case.requirements_completed_at is not None


@pytest.mark.django_db
@patch('processing.services.credit_case_status.CREDIT_CASE_AI_VERDICT_ENABLED', True)
def test_completing_requirements_advances_to_ai_verdict_when_enabled():
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    upload(credit_case, 'bank_statement')

    handle_requirements_progress(credit_case)

    credit_case.refresh_from_db()
    assert credit_case.status == 'pending_ai_verdict'


@pytest.mark.django_db
@pytest.mark.parametrize(
    'status',
    ['pending_ai_verdict', 'pending_final_verdict', 'buro_de_credito_rejected', 'complete'],
)
def test_case_already_past_missing_documents_is_left_alone(status):
    """Uploading one more document must never shunt a case through the pipeline."""
    credit_case = make_credit_case(status=status)
    require(credit_case, 'bank_statement')
    upload(credit_case, 'bank_statement')

    handle_requirements_progress(credit_case)

    credit_case.refresh_from_db()
    assert credit_case.status == status
    # The completion record is still worth keeping even though the status didn't move.
    assert credit_case.requirements_completed_at is not None


@pytest.mark.django_db
def test_timestamp_is_stamped_once_and_survives_a_new_requirement():
    """
    `requirements_completed_at` records WHEN the case was satisfied and is never
    un-stamped; `requirements_complete` is what tells you about right now.
    """
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    upload(credit_case, 'bank_statement')
    handle_requirements_progress(credit_case)

    credit_case.refresh_from_db()
    first_stamp = credit_case.requirements_completed_at

    # A requirement added later makes the case incomplete again...
    require(credit_case, 'income_statement')
    credit_case.refresh_from_db()
    assert credit_case.requirements_complete is False
    # ...but the record of having been complete stays.
    assert credit_case.requirements_completed_at == first_stamp

    # Satisfying it again doesn't move the original stamp.
    upload(credit_case, 'income_statement')
    credit_case.refresh_from_db()
    handle_requirements_progress(credit_case)
    credit_case.refresh_from_db()
    assert credit_case.requirements_completed_at == first_stamp


@pytest.mark.django_db
def test_optional_requirements_do_not_hold_a_case_back():
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    optional = CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=FileType.objects.get(key='income_statement', organization=None),
        is_required=False,
    )
    upload(credit_case, 'bank_statement')

    assert optional.is_required is False
    assert credit_case.requirements_complete is True
    handle_requirements_progress(credit_case)

    credit_case.refresh_from_db()
    assert credit_case.status == 'pending_final_verdict'


@pytest.mark.django_db
def test_unclassified_upload_satisfies_nothing():
    """
    A document GPT could not classify lands as 'unknown', which matches no requirement —
    so the case stays incomplete rather than being ticked off by an unrecognised file.
    """
    credit_case = make_credit_case()
    require(credit_case, 'bank_statement')
    upload(credit_case, 'unknown')

    assert credit_case.requirements_complete is False
    assert handle_requirements_progress(credit_case) is False
