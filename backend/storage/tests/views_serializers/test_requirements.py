"""
API tests for user-defined document requirements.

Covers the behaviour the feature promises: the catalog syncs idempotently, a new credit
case is seeded from its organization's default template (and gets nothing when there is
no template, which is the onboarding signal), the impact report describes a template
edit truthfully, applying it preserves per-case additions and leaves status alone, and
none of it reaches across organizations.
"""

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.file_type_spec import DEFAULT_SUGGESTION_KEYS
from core.file_type_sync import sync_global_file_types
from customers.models import Customer
from identity.models import Organization, User
from processing.models import CreditCase
from storage.models import (
    CreditCaseRequirement,
    FileType,
    RequirementTemplate,
    RequirementTemplateItem,
    UploadDocument,
)


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


def make_customer(org, name='Acme Customer'):
    return Customer.objects.create(organization=org, name=name)


def make_credit_case(customer, **kwargs):
    return CreditCase.objects.create(customer=customer, **kwargs)


def global_file_type(key):
    return FileType.objects.get(key=key, organization=None)


def make_template(org, keys, name='Default', is_default=True):
    template = RequirementTemplate.objects.create(
        organization=org, name=name, is_default=is_default,
    )
    for order, key in enumerate(keys):
        RequirementTemplateItem.objects.create(
            template=template, file_type=global_file_type(key), order=order,
        )
    return template


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_migration_seeded_the_global_file_types():
    """Every requirable catalog entry should exist as a global row after migrating."""
    for key in DEFAULT_SUGGESTION_KEYS:
        assert FileType.objects.filter(key=key, organization=None).exists()


@pytest.mark.django_db
def test_unknown_is_never_a_selectable_file_type():
    """
    'unknown' is the classifier's fallback bucket, not a document a customer could hand
    over, so it must never be offered as something a credit case can require.
    """
    assert not FileType.objects.filter(key='unknown').exists()


@pytest.mark.django_db
def test_sync_file_types_is_idempotent():
    before = FileType.objects.count()

    created, updated, unchanged = sync_global_file_types(FileType)

    assert (created, updated) == (0, 0)
    assert unchanged > 0
    assert FileType.objects.count() == before


@pytest.mark.django_db
def test_sync_file_types_repairs_a_renamed_label_without_touching_the_key():
    """A label edited by hand is restored from the catalog; the key never moves."""
    file_type = global_file_type('bank_statement')
    file_type.label_en = 'WRONG'
    file_type.save(update_fields=['label_en'])

    created, updated, unchanged = sync_global_file_types(FileType)

    file_type.refresh_from_db()
    assert (created, updated) == (0, 1)
    assert file_type.label_en == 'Bank statement'
    assert file_type.key == 'bank_statement'


# ---------------------------------------------------------------------------
# Seeding a new credit case
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_new_credit_case_is_seeded_from_the_default_template():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    make_template(org, ['bank_statement', 'balance_sheet'])

    res = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )

    assert res.status_code == status.HTTP_201_CREATED
    credit_case = CreditCase.objects.get(id=res.data['id'])
    assert credit_case.required_file_type_names == {'bank_statement', 'balance_sheet'}
    assert all(
        req.source == CreditCaseRequirement.Source.TEMPLATE
        for req in credit_case.requirements.all()
    )


@pytest.mark.django_db
def test_new_credit_case_has_no_requirements_when_org_has_no_template():
    """
    This is the onboarding signal: zero requirements is how the frontend knows to prompt
    the user to build their first template.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    res = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )

    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['required_file_type_names'] == []


@pytest.mark.django_db
def test_new_credit_case_can_pick_a_non_default_template():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    make_template(org, ['bank_statement'])
    other = make_template(org, ['income_statement'], name='Grandes', is_default=False)

    res = client.post(
        reverse('creditcase-list'),
        data={
            'customer': reverse('customer-detail', args=[customer.id]),
            'requirement_template': other.id,
        },
    )

    assert res.status_code == status.HTTP_201_CREATED
    credit_case = CreditCase.objects.get(id=res.data['id'])
    assert credit_case.required_file_type_names == {'income_statement'}


@pytest.mark.django_db
def test_credit_case_cannot_be_seeded_from_another_organizations_template():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    foreign_template = make_template(other_org, ['bank_statement'])

    res = client.post(
        reverse('creditcase-list'),
        data={
            'customer': reverse('customer-detail', args=[customer.id]),
            'requirement_template': foreign_template.id,
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Impact + apply
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_impact_reports_adds_removes_and_already_uploaded_documents():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement', 'balance_sheet'])

    credit_case = make_credit_case(customer)
    for key in ['bank_statement', 'balance_sheet']:
        CreditCaseRequirement.objects.create(
            credit_case=credit_case,
            file_type=global_file_type(key),
            source=CreditCaseRequirement.Source.TEMPLATE,
            source_template=template,
        )
    # The customer already handed in a balance sheet, which the edit below drops.
    UploadDocument.objects.create(
        credit_case=credit_case, file='x.pdf', file_type_name='balance_sheet',
    )

    # Edit the template: drop balance_sheet, add income_statement.
    template.items.filter(file_type__key='balance_sheet').delete()
    RequirementTemplateItem.objects.create(
        template=template, file_type=global_file_type('income_statement'),
    )

    res = client.get(reverse('requirementtemplate-impact', args=[template.id]))

    assert res.status_code == status.HTTP_200_OK
    (entry,) = res.data['credit_cases']
    assert entry['credit_case_id'] == credit_case.id
    assert [f['key'] for f in entry['adds']] == ['income_statement']
    assert [f['key'] for f in entry['removes']] == ['balance_sheet']
    # The warning the user needs before confirming.
    assert [f['key'] for f in entry['removes_with_uploads']] == ['balance_sheet']


@pytest.mark.django_db
def test_impact_ignores_submitted_cases():
    """A submitted case's requirements are the evidence its reviewer worked from."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    submitted = make_credit_case(customer, submitted_at=timezone.now())
    CreditCaseRequirement.objects.create(
        credit_case=submitted,
        file_type=global_file_type('bank_statement'),
        source=CreditCaseRequirement.Source.TEMPLATE,
        source_template=template,
    )
    RequirementTemplateItem.objects.create(
        template=template, file_type=global_file_type('income_statement'),
    )

    res = client.get(reverse('requirementtemplate-impact', args=[template.id]))

    assert res.data['credit_cases'] == []


@pytest.mark.django_db
def test_impact_is_empty_when_everything_is_in_sync():
    """The diff is computed live, so re-running it after applying reports nothing."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    credit_case = make_credit_case(customer)
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=global_file_type('bank_statement'),
        source=CreditCaseRequirement.Source.TEMPLATE,
        source_template=template,
    )

    res = client.get(reverse('requirementtemplate-impact', args=[template.id]))

    assert res.data['credit_cases'] == []


@pytest.mark.django_db
def test_apply_preserves_manual_requirements_and_leaves_status_alone():
    """
    The two guarantees that make re-syncing safe: a requirement the user added for this
    specific customer survives, and a case in flight isn't knocked backwards.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    credit_case = make_credit_case(customer, status='pending_ai_verdict')
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=global_file_type('bank_statement'),
        source=CreditCaseRequirement.Source.TEMPLATE,
        source_template=template,
    )
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=global_file_type('constancia_de_situacion_fiscal'),
        source=CreditCaseRequirement.Source.MANUAL,
    )

    # Template now wants income_statement instead of bank_statement.
    template.items.all().delete()
    RequirementTemplateItem.objects.create(
        template=template, file_type=global_file_type('income_statement'),
    )

    res = client.post(
        reverse('requirementtemplate-apply', args=[template.id]),
        data={'credit_case_ids': [credit_case.id]},
        format='json',
    )

    assert res.status_code == status.HTTP_200_OK
    credit_case.refresh_from_db()
    assert credit_case.required_file_type_names == {
        'income_statement',              # added by the sync
        'constancia_de_situacion_fiscal',  # the manual one, untouched
    }
    assert credit_case.status == 'pending_ai_verdict'  # never auto-regressed


@pytest.mark.django_db
def test_apply_stamps_an_audit_trail():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    credit_case = make_credit_case(customer)
    CreditCaseRequirement.objects.create(
        credit_case=credit_case,
        file_type=global_file_type('bank_statement'),
        source=CreditCaseRequirement.Source.TEMPLATE,
        source_template=template,
    )
    RequirementTemplateItem.objects.create(
        template=template, file_type=global_file_type('income_statement'),
    )

    client.post(
        reverse('requirementtemplate-apply', args=[template.id]),
        data={'credit_case_ids': [credit_case.id]},
        format='json',
    )

    added = credit_case.requirements.get(file_type__key='income_statement')
    assert added.synced_at is not None
    assert added.created_by == user


@pytest.mark.django_db
def test_apply_rejects_a_credit_case_from_another_organization():
    """
    The ids in the request body are never trusted — they are re-derived from the
    database against the template's own organization.
    """
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    template = make_template(org, ['bank_statement'])

    foreign_case = make_credit_case(make_customer(other_org, 'Other Customer'))

    res = client.post(
        reverse('requirementtemplate-apply', args=[template.id]),
        data={'credit_case_ids': [foreign_case.id]},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert foreign_case.requirements.count() == 0


@pytest.mark.django_db
def test_apply_rejects_a_submitted_case():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    submitted = make_credit_case(customer, submitted_at=timezone.now())
    CreditCaseRequirement.objects.create(
        credit_case=submitted,
        file_type=global_file_type('bank_statement'),
        source=CreditCaseRequirement.Source.TEMPLATE,
        source_template=template,
    )

    res = client.post(
        reverse('requirementtemplate-apply', args=[template.id]),
        data={'credit_case_ids': [submitted.id]},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


# ---------------------------------------------------------------------------
# Templates, file types and tenant isolation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_create_template_with_items():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)

    res = client.post(
        reverse('requirementtemplate-list'),
        data={
            'name': 'Default',
            'is_default': True,
            'items': [
                {'file_type': global_file_type('bank_statement').id, 'is_required': True},
                {'file_type': global_file_type('income_statement').id, 'is_required': False},
            ],
        },
        format='json',
    )

    assert res.status_code == status.HTTP_201_CREATED
    template = RequirementTemplate.objects.get(id=res.data['id'])
    assert template.organization == org
    assert template.items.count() == 2
    assert not template.items.get(file_type__key='income_statement').is_required


@pytest.mark.django_db
def test_template_rejects_duplicate_file_types():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    bank_statement = global_file_type('bank_statement').id

    res = client.post(
        reverse('requirementtemplate-list'),
        data={
            'name': 'Default',
            'items': [{'file_type': bank_statement}, {'file_type': bank_statement}],
        },
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_another_organizations_template_is_invisible():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    foreign_template = make_template(other_org, ['bank_statement'])

    listed = client.get(reverse('requirementtemplate-list'))
    fetched = client.get(reverse('requirementtemplate-detail', args=[foreign_template.id]))

    assert listed.data['results'] == [] if 'results' in listed.data else listed.data == []
    assert fetched.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_file_types_list_shows_globals_but_not_another_orgs_custom_types():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)

    FileType.objects.create(
        key='carta_de_poder', label_en='Carta de poder', label_es='Carta de poder',
        category='legal', organization=other_org,
    )

    res = client.get(reverse('filetype-list'))

    keys = {row['key'] for row in (res.data.get('results') or res.data)}
    assert 'bank_statement' in keys  # global, shared by everyone
    assert 'carta_de_poder' not in keys  # another organization's own


@pytest.mark.django_db
def test_manual_requirement_can_be_added_to_own_credit_case():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcaserequirement-list'),
        data={
            'credit_case': reverse('creditcase-detail', args=[credit_case.id]),
            'file_type': global_file_type('bank_statement').id,
        },
    )

    assert res.status_code == status.HTTP_201_CREATED
    requirement = CreditCaseRequirement.objects.get(id=res.data['id'])
    # Anything added here is a per-case deviation and must survive a template re-sync.
    assert requirement.source == CreditCaseRequirement.Source.MANUAL
    assert requirement.created_by == user


@pytest.mark.django_db
def test_manual_requirement_rejected_for_another_organizations_credit_case():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    foreign_case = make_credit_case(make_customer(other_org, 'Other Customer'))

    res = client.post(
        reverse('creditcaserequirement-list'),
        data={
            'credit_case': reverse('creditcase-detail', args=[foreign_case.id]),
            'file_type': global_file_type('bank_statement').id,
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert foreign_case.requirements.count() == 0


@pytest.mark.django_db
def test_serializer_independently_rejects_a_foreign_credit_case():
    """
    Tenant isolation here has two independent layers, and the viewset's queryset scoping
    normally catches a cross-organization write first (as "Invalid hyperlink"). This
    exercises the SECOND layer on its own — the serializer's own validate() — so a code
    path that builds the serializer without the viewset's scoping still can't write
    across tenants.
    """
    from rest_framework.test import APIRequestFactory

    from storage.serializers import CreditCaseRequirementSerializer

    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    foreign_case = make_credit_case(make_customer(other_org, 'Other Customer'))

    request = APIRequestFactory().post('/')
    request.user = user

    serializer = CreditCaseRequirementSerializer(
        data={
            'credit_case': foreign_case.id,
            'file_type': global_file_type('bank_statement').id,
        },
        # Unscoped on purpose: this is what the queryset narrowing would otherwise do.
        context={'request': request},
    )
    serializer.fields['credit_case'] = pytest.importorskip(
        'rest_framework.serializers'
    ).PrimaryKeyRelatedField(queryset=CreditCase.objects.all())

    assert not serializer.is_valid()
    assert 'You do not have access to this credit case.' in str(serializer.errors)


# ---------------------------------------------------------------------------
# set-requirements (the create-case flow's document chooser)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_set_requirements_from_template_keeps_case_resyncable():
    """
    Picking "Default" must produce template-sourced rows, so this case still shows up in
    that template's later impact reports.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    template = make_template(org, ['bank_statement', 'balance_sheet'])
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={'requirement_template': template.id},
        format='json',
    )

    assert res.status_code == status.HTTP_200_OK
    assert credit_case.required_file_type_names == {'bank_statement', 'balance_sheet'}
    assert all(
        req.source == CreditCaseRequirement.Source.TEMPLATE and req.source_template_id == template.id
        for req in credit_case.requirements.all()
    )


@pytest.mark.django_db
def test_set_requirements_from_file_type_ids_marks_them_manual():
    """
    Picking individual documents is a deliberate opt-out of the default, so the rows are
    manual and a later template re-sync must skip this case entirely.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    template = make_template(org, ['bank_statement'])
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={'file_type_ids': [global_file_type('income_statement').id]},
        format='json',
    )

    assert res.status_code == status.HTTP_200_OK
    assert credit_case.required_file_type_names == {'income_statement'}
    assert all(
        req.source == CreditCaseRequirement.Source.MANUAL
        for req in credit_case.requirements.all()
    )
    # Opted out, so the template's impact report leaves it alone.
    impact = client.get(reverse('requirementtemplate-impact', args=[template.id]))
    assert impact.data['credit_cases'] == []


@pytest.mark.django_db
def test_set_requirements_replaces_what_the_case_already_had():
    """The chooser is "exactly these", not "add these" — seeded rows not picked go away."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    make_template(org, ['bank_statement', 'balance_sheet'])
    customer = make_customer(org)

    created = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )
    credit_case = CreditCase.objects.get(id=created.data['id'])
    assert credit_case.required_file_type_names == {'bank_statement', 'balance_sheet'}

    client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={'file_type_ids': [global_file_type('bank_statement').id]},
        format='json',
    )

    assert credit_case.required_file_type_names == {'bank_statement'}


@pytest.mark.django_db
def test_set_requirements_rejects_both_modes_at_once():
    """Ambiguous: the resulting rows would have no clear source. Must be one or the other."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    template = make_template(org, ['bank_statement'])
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={
            'requirement_template': template.id,
            'file_type_ids': [global_file_type('income_statement').id],
        },
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_set_requirements_rejects_empty_body():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_set_requirements_rejects_another_organizations_template():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    foreign_template = make_template(other_org, ['bank_statement'])
    credit_case = make_credit_case(make_customer(org))

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={'requirement_template': foreign_template.id},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert credit_case.requirements.count() == 0


@pytest.mark.django_db
def test_set_requirements_rejects_another_organizations_credit_case():
    org = make_org()
    other_org = make_org('Other', 'other.com')
    user = make_user_in_org(org)
    client = make_client_for(user)
    foreign_case = make_credit_case(make_customer(other_org, 'Other Customer'))

    res = client.post(
        reverse('creditcase-set-requirements', args=[foreign_case.id]),
        data={'file_type_ids': [global_file_type('bank_statement').id]},
        format='json',
    )

    assert res.status_code == status.HTTP_404_NOT_FOUND
    assert foreign_case.requirements.count() == 0
