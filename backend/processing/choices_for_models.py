from typing import Iterable
from django.db import models
from django.utils.translation import gettext_lazy as _


class CreditCaseStatus(models.TextChoices):
    """
    Credit case status like pending, approved, rejected.
    Items are in order of sequence.
    """
    MISSING_DOCUMENTS = 'missing_documents', 'Missing Documents'  # Credit case created but not yet processed
    PENDING_AI_VERDICT = 'pending_ai_verdict', 'Pending AI Verdict'  # Credit case is being processed by internal gpt analysis process
    PENDING_FINAL_VERDICT = 'pending_final_verdict', 'Pending Final Verdict'  # gpt analysis process approved the loan, waiting for final human review
    COMPLETE = 'complete', 'Complete'  # Credit case has been approved or rejected after human review


class CreditCaseFinalVerdict(models.TextChoices):
    """ Final verdict after human review: approved or rejected. """
    PENDING = 'pending', 'Pending'
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class RequestedTermDays(models.IntegerChoices):
    """Requested net terms for trade credit, in days."""
    DAYS_15 = 15, _('15 days')
    DAYS_30 = 30, _('30 days')
    DAYS_45 = 45, _('45 days')
    DAYS_60 = 60, _('60 days')
    DAYS_90 = 90, _('90 days')


class ApplicationStatus(models.TextChoices):
    """
    Account application status like pending, approved, rejected.
    Items are in order of sequence.
    """
    PENDING_USER_DATA_UPLOAD = 'pending_user_data_upload', 'Pending User Data Upload'  # User missing required files to process internally
    PENDING_INTERNAL_REVIEW = 'pending_internal_review', 'Pending Internal Review'  # User has uploaded all required data, running internal gpt analysis process
    PENDING_USER_AGREEMENT = 'pending_user_agreement', 'Pending User Agreement'  # gpt analysis process approved the loan, user must sign the agreement
    APPROVED = 'approved', 'Approved'  # User has signed the agreement
    REJECTED = 'rejected', 'Rejected'  # gpt analysis process rejected the loan
    USER_REJECTED = 'user_rejected', 'User Rejected'  # User rejected the loan terms


class LoanVerdictStatus(models.TextChoices):
    """ The loan verdict response: approved or rejected. """
    APPROVED = 'approved', 'Approved'
    REJECTED = 'rejected', 'Rejected'


class CreditVerdictStatus(models.TextChoices):
    """ Buro De Credito score: passed or failed. """
    PASSED = 'passed', 'Passed'
    FAILED = 'failed', 'Failed'
    PENDING = 'pending', 'Pending'

