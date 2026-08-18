"""
Tests for `classification_status` (storage/services/classification_state.py).

The function answers one question the UI cannot answer for itself: is the background
classifier still working on this document, or has it gone quiet? A spinner shown on the
wrong answer is worse than no spinner — it either hides that nothing is happening, or
never stops.
"""

from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone

from customers.models import Customer
from identity.models import Organization
from storage.models import UploadDocument
from storage.services.classification_state import (
    CLASSIFIED,
    PROCESSING,
    UNCLASSIFIED,
    classification_status,
)


def make_document(file_type_name=None):
    org = Organization.objects.create(name='Acme', email_domain='acme.com')
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    return UploadDocument.objects.create(
        customer=customer,
        file=SimpleUploadedFile('doc.pdf', b'content', content_type='application/pdf'),
        file_type_name=file_type_name,
    )


@pytest.mark.django_db
def test_a_document_with_a_type_is_classified():
    doc = make_document(file_type_name='bank_statement')

    assert classification_status(doc) == CLASSIFIED


@pytest.mark.django_db
def test_unknown_counts_as_classified():
    """
    `unknown` is the classifier saying "I could not tell" — an answer, not the absence of
    one. Treating it as still-in-progress would spin forever on a job that finished.
    """
    doc = make_document(file_type_name='unknown')

    assert classification_status(doc) == CLASSIFIED


@pytest.mark.django_db
def test_a_document_with_a_type_is_classified_however_old_it_is():
    doc = make_document(file_type_name='bank_statement')

    later = timezone.now() + timedelta(days=30)

    assert classification_status(doc, now=later) == CLASSIFIED


@pytest.mark.django_db
@override_settings(DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS=300)
def test_a_freshly_uploaded_document_is_still_processing():
    doc = make_document()

    assert classification_status(doc) == PROCESSING


@pytest.mark.django_db
@override_settings(DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS=300)
def test_still_processing_just_inside_the_timeout():
    doc = make_document()

    almost_timed_out = doc.uploaded_at + timedelta(seconds=299)

    assert classification_status(doc, now=almost_timed_out) == PROCESSING


@pytest.mark.django_db
@override_settings(DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS=300)
def test_gives_up_once_the_timeout_has_passed():
    """
    Past the timeout the likelier explanation is a worker that never ran the job, so the
    document is reported as unclassified and the user gets a control they can use.
    """
    doc = make_document()

    timed_out = doc.uploaded_at + timedelta(seconds=300)

    assert classification_status(doc, now=timed_out) == UNCLASSIFIED


@pytest.mark.django_db
@override_settings(DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS=300)
def test_a_long_abandoned_document_is_unclassified():
    doc = make_document()

    much_later = doc.uploaded_at + timedelta(days=7)

    assert classification_status(doc, now=much_later) == UNCLASSIFIED


@pytest.mark.django_db
@override_settings(DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS=30)
def test_the_timeout_is_configurable():
    """The window is a setting so it can be tuned without touching this logic."""
    doc = make_document()

    assert classification_status(doc, now=doc.uploaded_at + timedelta(seconds=29)) == PROCESSING
    assert classification_status(doc, now=doc.uploaded_at + timedelta(seconds=31)) == UNCLASSIFIED


def test_an_unsaved_document_is_processing():
    """
    No `uploaded_at` yet means the row has not been saved, so nothing has been queued for
    it. Reported as processing rather than crashing on the arithmetic.
    """
    assert classification_status(UploadDocument()) == PROCESSING
