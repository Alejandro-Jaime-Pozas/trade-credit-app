"""
Tests for promote_csf_fields_to_customer: after a CSF document is processed,
its extracted rfc/razon_social should auto-fill the linked Customer, but only
when those fields are empty and without breaking the (organization, rfc) unique
constraint.
"""

import pytest

from customers.models import Customer
from identity.models import Organization
from processing.models import CreditCase
from storage.models import UploadDocument
from storage.services.db_object_handling import promote_csf_fields_to_customer


CSF = 'constancia_de_situacion_fiscal'


def make_org(domain='acme.com'):
    # Organization.save() runs full_clean, so email_domain must be a valid domain
    # (no underscores) — hence 'acme.com'.
    return Organization.objects.create(name='Acme', email_domain=domain)


def make_customer(org, name='Acme Customer', **kwargs):
    return Customer.objects.create(organization=org, name=name, **kwargs)


def make_csf_doc(credit_case, extracted_data, file_type_name=CSF):
    # The helper only reads file_type_name, extracted_data, and credit_case.customer,
    # so an unsaved UploadDocument instance is enough (no media file needed).
    return UploadDocument(
        credit_case=credit_case,
        file_type_name=file_type_name,
        extracted_data=extracted_data,
    )


@pytest.mark.django_db
def test_fills_rfc_and_legal_name_when_blank():
    org = make_org()
    customer = make_customer(org)  # rfc and legal_name start blank
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {'rfc': 'ABC123456789', 'razon_social': 'ACME SA DE CV'})

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.rfc == 'ABC123456789'
    assert customer.legal_name == 'ACME SA DE CV'


@pytest.mark.django_db
def test_does_not_overwrite_existing_values():
    org = make_org()
    # Customer already has both values set by the user
    customer = make_customer(org, rfc='EXISTING1234', legal_name='Existing Legal Name')
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {'rfc': 'ABC123456789', 'razon_social': 'New Extracted Name'})

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    # Fill-only-if-empty: nothing should change
    assert customer.rfc == 'EXISTING1234'
    assert customer.legal_name == 'Existing Legal Name'


@pytest.mark.django_db
def test_skips_rfc_on_collision_but_still_fills_legal_name():
    org = make_org()
    # Another customer in the same org already uses this rfc
    make_customer(org, name='Other Customer', rfc='DUP123456789')
    customer = make_customer(org, name='Target Customer')  # blank rfc + legal_name
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {'rfc': 'DUP123456789', 'razon_social': 'Target Legal Name'})

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    # rfc is skipped (would collide), but legal_name still fills
    assert customer.rfc is None
    assert customer.legal_name == 'Target Legal Name'


@pytest.mark.django_db
def test_noop_for_non_csf_document():
    org = make_org()
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(
        credit_case,
        {'rfc': 'ABC123456789', 'razon_social': 'ACME SA DE CV'},
        file_type_name='income_statement',
    )

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.rfc is None
    assert customer.legal_name is None


@pytest.mark.django_db
def test_noop_when_no_extracted_data():
    org = make_org()
    customer = make_customer(org)
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, extracted_data=None)

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.rfc is None
    assert customer.legal_name is None
