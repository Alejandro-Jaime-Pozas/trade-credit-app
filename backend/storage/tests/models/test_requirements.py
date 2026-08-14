"""
Database-level tests for the document requirement models.

Covers the constraints that the rest of the feature relies on being true: that a global
file type key can't be duplicated (the partial index, which the ordinary unique
constraint can't cover because Postgres treats NULLs as distinct), that an organization
can only have one default template, and that a credit case can't list the same document
twice.
"""

import pytest
from django.db import IntegrityError, transaction

from customers.models import Customer
from identity.models import Organization
from processing.models import CreditCase
from storage.models import (
    CreditCaseRequirement,
    FileType,
    RequirementTemplate,
    RequirementTemplateItem,
)


def make_org(name='Acme', domain='acme.com'):
    return Organization.objects.create(name=name, email_domain=domain)


def make_file_type(key='acta_constitutiva', organization=None):
    return FileType.objects.create(
        key=key,
        label_en=key.replace('_', ' ').title(),
        label_es=key.replace('_', ' ').title(),
        category='legal',
        organization=organization,
    )


@pytest.mark.django_db
def test_global_file_type_key_cannot_be_duplicated():
    """
    The plain unique(organization, key) constraint does NOT catch this: both rows have
    organization=NULL, and Postgres treats two NULLs as different values. The partial
    unique index on key WHERE organization IS NULL is what actually rejects it.
    """
    make_file_type(key='acta_constitutiva')

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            make_file_type(key='acta_constitutiva')


@pytest.mark.django_db
def test_same_key_allowed_for_a_global_and_an_organization_type():
    """
    An organization defining its own type that happens to share a global type's key is
    a separate row, not an edit to the global one.
    """
    org = make_org()
    make_file_type(key='carta_de_poder')
    make_file_type(key='carta_de_poder', organization=org)

    assert FileType.objects.filter(key='carta_de_poder').count() == 2


@pytest.mark.django_db
def test_organization_can_only_have_one_default_template():
    org = make_org()
    RequirementTemplate.objects.create(organization=org, name='Default', is_default=True)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RequirementTemplate.objects.create(
                organization=org, name='Otro', is_default=True,
            )


@pytest.mark.django_db
def test_organization_can_have_many_non_default_templates():
    org = make_org()
    RequirementTemplate.objects.create(organization=org, name='Default', is_default=True)
    RequirementTemplate.objects.create(organization=org, name='Clientes grandes')
    RequirementTemplate.objects.create(organization=org, name='Clientes chicos')

    assert org.requirement_templates.count() == 3


@pytest.mark.django_db
def test_template_cannot_list_the_same_file_type_twice():
    org = make_org()
    template = RequirementTemplate.objects.create(organization=org, name='Default')
    file_type = make_file_type()
    RequirementTemplateItem.objects.create(template=template, file_type=file_type)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RequirementTemplateItem.objects.create(template=template, file_type=file_type)


@pytest.mark.django_db
def test_credit_case_cannot_require_the_same_file_type_twice():
    org = make_org()
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)
    file_type = make_file_type()
    CreditCaseRequirement.objects.create(credit_case=credit_case, file_type=file_type)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            CreditCaseRequirement.objects.create(
                credit_case=credit_case, file_type=file_type,
            )


@pytest.mark.django_db
def test_deleting_a_credit_case_cascades_its_requirements():
    org = make_org()
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)
    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=make_file_type(),
    )

    credit_case.delete()

    assert CreditCaseRequirement.objects.count() == 0


@pytest.mark.django_db
def test_required_and_optional_file_type_names_are_split():
    """
    Optional requirements are listed for the user but must never count toward
    completeness, so they stay out of required_file_type_names entirely.
    """
    org = make_org()
    customer = Customer.objects.create(organization=org, name='Acme Customer')
    credit_case = CreditCase.objects.create(customer=customer)

    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=make_file_type(key='needed'), is_required=True,
    )
    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=make_file_type(key='nice_to_have'), is_required=False,
    )

    assert credit_case.required_file_type_names == {'needed'}
    assert credit_case.optional_file_type_names == {'nice_to_have'}
    # The optional one must not show up as "missing" and hold the case up.
    assert credit_case.missing_file_type_names == {'needed'}
