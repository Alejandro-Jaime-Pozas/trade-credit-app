"""
Renaming and deleting an uploaded document.

Files arrive named whatever the customer's scanner called them ("scan_0012.pdf"), which
tells a reviewer nothing — so `friendly_file_name` is writable and the user can give a
document a name they will recognize later. `original_title` deliberately stays read-only:
it is the record of what was actually sent.

Deleting matters for more than tidiness. `CreditCase.requirements_complete` is derived
from the documents that exist right now, so removing one can un-satisfy a requirement —
the case has to be pulled back rather than left sitting in a review queue on the strength
of a document that is gone.
"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from customers.models import Customer
from identity.models import Organization, User
from processing.choices_for_models import CreditCaseStatus
from processing.models import CreditCase
from storage.models import CreditCaseRequirement, FileType, UploadDocument


def make_org(name='Acme', domain='acme.com'):
    return Organization.objects.create(name=name, email_domain=domain)


def make_user_in_org(org, email='user@acme.com'):
    user = User.objects.create_user(email=email)
    user.organizations.add(org)
    return user


def make_client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def make_document(org, customer=None, credit_case=None, file_type_name='unknown'):
    if customer is None:
        customer = Customer.objects.create(organization=org, name='Acme Customer')
    return UploadDocument.objects.create(
        customer=customer,
        credit_case=credit_case,
        file=SimpleUploadedFile('scan_0012.pdf', b'content', content_type='application/pdf'),
        file_type_name=file_type_name,
    )


def detail_url(doc):
    return reverse('uploaddocument-detail', args=[doc.id])


# ── Renaming ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_user_can_give_a_document_a_readable_name():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)

    res = client.patch(
        detail_url(doc),
        data={'friendly_file_name': 'Bank statement - March'},
    )

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.friendly_file_name == 'Bank statement - March'


@pytest.mark.django_db
def test_renaming_leaves_the_original_file_name_untouched():
    """The friendly name is a display label on top of the file, never a replacement."""
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)
    original = doc.original_title

    res = client.patch(detail_url(doc), data={'friendly_file_name': 'Renamed'})

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.original_title == original


@pytest.mark.django_db
def test_a_blank_name_clears_it_back_to_null():
    """
    "No friendly name" must be one state in the database, not two — otherwise every
    reader would have to test for null AND for empty string.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)
    doc.friendly_file_name = 'Something'
    doc.save(update_fields=['friendly_file_name'])

    res = client.patch(detail_url(doc), data={'friendly_file_name': '   '})

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.friendly_file_name is None


@pytest.mark.django_db
def test_surrounding_whitespace_is_trimmed():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)

    res = client.patch(detail_url(doc), data={'friendly_file_name': '  Acta constitutiva  '})

    assert res.status_code == status.HTTP_200_OK
    doc.refresh_from_db()
    assert doc.friendly_file_name == 'Acta constitutiva'


@pytest.mark.django_db
def test_cannot_rename_another_organizations_document():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    client = make_client_for(make_user_in_org(org))
    other_doc = make_document(other_org)

    res = client.patch(detail_url(other_doc), data={'friendly_file_name': 'Mine now'})

    assert res.status_code == status.HTTP_404_NOT_FOUND
    other_doc.refresh_from_db()
    assert other_doc.friendly_file_name is None


# ── Deleting ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_user_can_delete_their_own_document():
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    doc = make_document(org)

    res = client.delete(detail_url(doc))

    assert res.status_code == status.HTTP_204_NO_CONTENT
    assert not UploadDocument.objects.filter(id=doc.id).exists()


@pytest.mark.django_db
def test_cannot_delete_another_organizations_document():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    client = make_client_for(make_user_in_org(org))
    other_doc = make_document(other_org)

    res = client.delete(detail_url(other_doc))

    assert res.status_code == status.HTTP_404_NOT_FOUND
    assert UploadDocument.objects.filter(id=other_doc.id).exists()


@pytest.mark.django_db
def test_deleting_the_satisfying_document_pulls_the_case_back():
    """
    The case below is waiting on a human verdict only because its one required document
    arrived. Delete that document and the case must go back to missing documents, rather
    than stay in a reviewer's queue with nothing to review.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(
        customer=customer,
        status=CreditCaseStatus.PENDING_FINAL_VERDICT,
    )
    # The global catalog is seeded by migration, so reuse the existing row rather than
    # creating a duplicate global key (unique_global_file_type_key).
    file_type, _ = FileType.objects.get_or_create(
        key='bank_statement',
        organization=None,
        defaults={
            'label_en': 'Bank statement',
            'label_es': 'Estado de cuenta bancario',
            'category': 'financial',
        },
    )
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=file_type,
        is_required=True,
    )
    doc = make_document(
        org,
        customer=customer,
        credit_case=credit_case,
        file_type_name='bank_statement',
    )
    assert credit_case.requirements_complete

    res = client.delete(detail_url(doc))

    assert res.status_code == status.HTTP_204_NO_CONTENT
    credit_case.refresh_from_db()
    assert credit_case.status == CreditCaseStatus.MISSING_DOCUMENTS


@pytest.mark.django_db
def test_deleting_a_document_leaves_an_already_complete_case_alone():
    """
    A case that still has everything it needs must not be disturbed by deleting an extra,
    unrelated upload — the recompute only reacts to a requirement actually going unmet.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(
        customer=customer,
        status=CreditCaseStatus.PENDING_FINAL_VERDICT,
    )
    file_type, _ = FileType.objects.get_or_create(
        key='bank_statement',
        organization=None,
        defaults={
            'label_en': 'Bank statement',
            'label_es': 'Estado de cuenta bancario',
            'category': 'financial',
        },
    )
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=file_type,
        is_required=True,
    )
    make_document(
        org,
        customer=customer,
        credit_case=credit_case,
        file_type_name='bank_statement',
    )
    # A second, unrequired document — deleting this one changes nothing.
    extra = make_document(
        org,
        customer=customer,
        credit_case=credit_case,
        file_type_name='unknown',
    )

    res = client.delete(detail_url(extra))

    assert res.status_code == status.HTTP_204_NO_CONTENT
    credit_case.refresh_from_db()
    assert credit_case.status == CreditCaseStatus.PENDING_FINAL_VERDICT
