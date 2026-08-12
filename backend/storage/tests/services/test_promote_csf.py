"""
Tests for promote_csf_fields_to_customer: after a CSF document is processed,
its extracted rfc/razon_social/nombre_de_vialidad/codigo_postal should auto-fill
the linked Customer, but only when those fields are empty and without breaking
the (organization, rfc) unique constraint.
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


def make_customer_only_csf_doc(customer, extracted_data, file_type_name=CSF):
    # No credit_case at all — e.g. a doc uploaded from the Customer detail page.
    return UploadDocument(
        customer=customer,
        file_type_name=file_type_name,
        extracted_data=extracted_data,
    )


@pytest.mark.django_db
def test_fills_rfc_and_legal_name_when_blank():
    org = make_org()
    customer = make_customer(org)  # rfc and legal_name start blank
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {
        'rfc': 'ABC123456789',
        'razon_social': 'ACME SA DE CV',
        'nombre_de_vialidad': 'Av Reforma',
        'codigo_postal': '06600',
    })

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.rfc == 'ABC123456789'
    assert customer.legal_name == 'ACME SA DE CV'
    assert customer.nombre_de_vialidad == 'Av Reforma'
    assert customer.codigo_postal == '06600'


@pytest.mark.django_db
def test_does_not_overwrite_existing_values():
    org = make_org()
    # Customer already has all values set by the user
    customer = make_customer(
        org,
        rfc='EXISTING1234',
        legal_name='Existing Legal Name',
        nombre_de_vialidad='Existing Street',
        codigo_postal='11111',
    )
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {
        'rfc': 'ABC123456789',
        'razon_social': 'New Extracted Name',
        'nombre_de_vialidad': 'New Street',
        'codigo_postal': '22222',
    })

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    # Fill-only-if-empty: nothing should change
    assert customer.rfc == 'EXISTING1234'
    assert customer.legal_name == 'Existing Legal Name'
    assert customer.nombre_de_vialidad == 'Existing Street'
    assert customer.codigo_postal == '11111'


@pytest.mark.django_db
def test_skips_rfc_on_collision_but_still_fills_other_fields():
    org = make_org()
    # Another customer in the same org already uses this rfc
    make_customer(org, name='Other Customer', rfc='DUP123456789')
    customer = make_customer(org, name='Target Customer')  # all fields blank
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {
        'rfc': 'DUP123456789',
        'razon_social': 'Target Legal Name',
        'nombre_de_vialidad': 'Target Street',
        'codigo_postal': '33333',
    })

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    # rfc is skipped (would collide), but the other fields still fill
    assert customer.rfc is None
    assert customer.legal_name == 'Target Legal Name'
    assert customer.nombre_de_vialidad == 'Target Street'
    assert customer.codigo_postal == '33333'


@pytest.mark.django_db
def test_fills_only_blank_address_fields_individually():
    org = make_org()
    # codigo_postal already set by the user, nombre_de_vialidad still blank
    customer = make_customer(org, codigo_postal='99999')
    credit_case = CreditCase.objects.create(customer=customer)
    doc = make_csf_doc(credit_case, {
        'rfc': 'ABC123456789',
        'razon_social': 'ACME SA DE CV',
        'nombre_de_vialidad': 'Av Reforma',
        'codigo_postal': '06600',
    })

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.nombre_de_vialidad == 'Av Reforma'
    assert customer.codigo_postal == '99999'  # untouched, was already set


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
def test_fills_rfc_and_legal_name_from_customer_only_doc():
    """
    Regression test: a CSF uploaded from the Customer detail page (no
    credit_case at all) must still auto-fill the customer, via the
    doc.customer fallback.
    """
    org = make_org()
    customer = make_customer(org)  # rfc and legal_name start blank
    doc = make_customer_only_csf_doc(customer, {
        'rfc': 'ABC123456789',
        'razon_social': 'ACME SA DE CV',
        'nombre_de_vialidad': 'Av Reforma',
        'codigo_postal': '06600',
    })

    promote_csf_fields_to_customer(doc)

    customer.refresh_from_db()
    assert customer.rfc == 'ABC123456789'
    assert customer.legal_name == 'ACME SA DE CV'


@pytest.mark.django_db
def test_noop_when_no_customer_or_credit_case():
    doc = UploadDocument(
        file_type_name=CSF,
        extracted_data={'rfc': 'ABC123456789', 'razon_social': 'ACME SA DE CV'},
    )

    # Must not raise (e.g. AttributeError from doc.credit_case.customer).
    promote_csf_fields_to_customer(doc)


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
