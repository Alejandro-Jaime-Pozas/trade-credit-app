"""
API tests for user-defined document requirements.

Covers the behaviour the feature promises: the catalog syncs idempotently, a new credit
case is seeded from its organization's default template (and gets nothing when there is
no template, which is the onboarding signal), the impact report describes a template
edit truthfully, applying it preserves per-case additions and leaves status alone, and
none of it reaches across organizations.
"""

import unicodedata

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.file_type_spec import DEFAULT_SUGGESTION_KEYS
from core.file_type_spec import REQUIRABLE_KEYS
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


def alphabetical_key(name):
    """
    Sort a display name the way Postgres' default collation does.

    Postgres ignores case, accents and spaces when ordering, so "Declaración anual" sorts
    before "Declaraciones provisionales" — while Python's plain `sorted` compares raw
    code points and puts them the other way round. Tests that assert an API list arrived
    sorted have to use the database's rules, not Python's.
    """
    stripped = unicodedata.normalize('NFKD', name)
    without_accents = ''.join(c for c in stripped if not unicodedata.combining(c))
    return ''.join(c for c in without_accents if c.isalnum()).lower()


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
def test_every_requirable_catalog_type_reaches_the_table():
    """
    Requirement templates point at FileType ROWS, not at the catalog tuple, so a spec
    added to `core/file_type_catalog.py` is invisible to users until it is synced. This
    fails the moment someone adds a type without the table catching up — which is easy to
    miss, because nothing else errors.
    """
    synced_keys = set(
        FileType.objects.filter(organization=None).values_list('key', flat=True)
    )

    assert set(REQUIRABLE_KEYS) - synced_keys == set()


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

    listed = res.data['results'] if 'results' in res.data else res.data
    keys = {row['key'] for row in listed}
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


# ---------------------------------------------------------------------------
# Editing one case's requirements during its active life
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_removing_a_template_requirement_sticks_through_a_resync():
    """
    The headline guarantee of sticky removals: a document deliberately dropped from ONE
    case must not come back the next time the organization's template is applied.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    template = make_template(org, ['bank_statement', 'balance_sheet'])
    customer = make_customer(org)

    created = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )
    credit_case = CreditCase.objects.get(id=created.data['id'])
    balance_sheet_req = credit_case.requirements.get(file_type__key='balance_sheet')

    res = client.delete(
        reverse('creditcaserequirement-detail', args=[balance_sheet_req.id]),
    )
    assert res.status_code == status.HTTP_204_NO_CONTENT
    assert credit_case.required_file_type_names == {'bank_statement'}

    # The row is kept, flagged excluded — that is what blocks the re-add.
    balance_sheet_req.refresh_from_db()
    assert balance_sheet_req.is_excluded is True

    # Now edit the template and push it onto this case.
    RequirementTemplateItem.objects.create(
        template=template, file_type=global_file_type('income_statement'),
    )
    client.post(
        reverse('requirementtemplate-apply', args=[template.id]),
        data={'credit_case_ids': [credit_case.id]},
        format='json',
    )

    # The new document arrived; the dropped one did NOT come back.
    assert credit_case.required_file_type_names == {'bank_statement', 'income_statement'}


@pytest.mark.django_db
def test_excluded_requirement_is_hidden_from_the_api_list():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    make_template(org, ['bank_statement'])
    customer = make_customer(org)

    created = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )
    credit_case = CreditCase.objects.get(id=created.data['id'])
    requirement = credit_case.requirements.get(file_type__key='bank_statement')
    client.delete(reverse('creditcaserequirement-detail', args=[requirement.id]))

    res = client.get(reverse('creditcaserequirement-list'))
    rows = res.data['results'] if 'results' in res.data else res.data
    assert [r for r in rows if r['id'] == requirement.id] == []


@pytest.mark.django_db
def test_re_adding_an_excluded_requirement_turns_it_back_on():
    """
    Adding back something previously dropped must not collide with the excluded row that
    unique(credit_case, file_type) still holds.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    make_template(org, ['bank_statement'])
    customer = make_customer(org)

    created = client.post(
        reverse('creditcase-list'),
        data={'customer': reverse('customer-detail', args=[customer.id])},
    )
    credit_case = CreditCase.objects.get(id=created.data['id'])
    requirement = credit_case.requirements.get(file_type__key='bank_statement')
    client.delete(reverse('creditcaserequirement-detail', args=[requirement.id]))

    res = client.post(
        reverse('creditcaserequirement-list'),
        data={
            'credit_case': reverse('creditcase-detail', args=[credit_case.id]),
            'file_type': global_file_type('bank_statement').id,
        },
    )

    assert res.status_code == status.HTTP_201_CREATED
    assert credit_case.requirements.filter(file_type__key='bank_statement').count() == 1
    assert credit_case.required_file_type_names == {'bank_statement'}


@pytest.mark.django_db
def test_adding_a_requirement_pulls_a_waiting_case_back_to_missing_documents():
    """
    A user saying "this case needs more" is a direct decision about that case, so it
    should stop waiting for a verdict it isn't ready for.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    credit_case = make_credit_case(customer, status='pending_final_verdict')
    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=global_file_type('bank_statement'),
    )
    UploadDocument.objects.create(
        credit_case=credit_case, file='x.pdf', file_type_name='bank_statement',
    )
    assert credit_case.requirements_complete is True

    client.post(
        reverse('creditcaserequirement-list'),
        data={
            'credit_case': reverse('creditcase-detail', args=[credit_case.id]),
            'file_type': global_file_type('income_statement').id,
        },
    )

    credit_case.refresh_from_db()
    assert credit_case.requirements_complete is False
    assert credit_case.status == 'missing_documents'


@pytest.mark.django_db
def test_removing_the_blocking_requirement_advances_the_case():
    """The mirror image: dropping the only outstanding document completes the case."""
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)

    credit_case = make_credit_case(customer)
    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=global_file_type('bank_statement'),
    )
    blocking = CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=global_file_type('income_statement'),
    )
    UploadDocument.objects.create(
        credit_case=credit_case, file='x.pdf', file_type_name='bank_statement',
    )
    assert credit_case.status == 'missing_documents'

    client.delete(reverse('creditcaserequirement-detail', args=[blocking.id]))

    credit_case.refresh_from_db()
    assert credit_case.requirements_complete is True
    assert credit_case.status == 'pending_final_verdict'


@pytest.mark.django_db
def test_template_resync_still_never_regresses_status():
    """
    Manual edits may pull a case backwards; a bulk template re-sync must not. Otherwise
    editing one template could yank a pile of cases out of a reviewer's queue at once.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    template = make_template(org, ['bank_statement'])

    credit_case = make_credit_case(customer, status='pending_final_verdict')
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

    credit_case.refresh_from_db()
    assert credit_case.requirements_complete is False  # the new doc is missing
    assert credit_case.status == 'pending_final_verdict'  # but the queue is untouched


@pytest.mark.django_db
def test_submitted_case_rejects_adding_a_requirement():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    credit_case = make_credit_case(make_customer(org), submitted_at=timezone.now())

    res = client.post(
        reverse('creditcaserequirement-list'),
        data={
            'credit_case': reverse('creditcase-detail', args=[credit_case.id]),
            'file_type': global_file_type('bank_statement').id,
        },
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert credit_case.requirements.count() == 0


@pytest.mark.django_db
def test_submitted_case_rejects_removing_a_requirement():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    credit_case = make_credit_case(make_customer(org))
    requirement = CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=global_file_type('bank_statement'),
    )
    # Submitted after the requirement existed, which is the realistic ordering.
    credit_case.submitted_at = timezone.now()
    credit_case.save(update_fields=['submitted_at'])

    res = client.delete(reverse('creditcaserequirement-detail', args=[requirement.id]))

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    requirement.refresh_from_db()
    assert requirement.is_excluded is False


@pytest.mark.django_db
def test_submitted_case_rejects_bulk_set_requirements():
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    credit_case = make_credit_case(make_customer(org), submitted_at=timezone.now())

    res = client.post(
        reverse('creditcase-set-requirements', args=[credit_case.id]),
        data={'file_type_ids': [global_file_type('bank_statement').id]},
        format='json',
    )

    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert credit_case.requirements.count() == 0


@pytest.mark.django_db
def test_sync_copies_the_display_group_and_suggestion_flag():
    """
    Both fields are what let the frontend show 22 documents as a tidy grouped list with a
    sensible starting selection, rather than one undifferentiated wall of buttons.
    """
    acta = global_file_type('acta_constitutiva')

    assert acta.group == 'legal'
    assert acta.is_default_suggestion is True

    # Group is NOT category: an acta is timeless, so its recency bucket is "other" while
    # a person still looks for it under "Legal / corporate".
    assert acta.category == 'other'


@pytest.mark.django_db
def test_sync_repairs_a_group_edited_by_hand():
    file_type = global_file_type('bank_statement')
    file_type.group = 'operational'
    file_type.is_default_suggestion = False
    file_type.save(update_fields=['group', 'is_default_suggestion'])

    sync_global_file_types(FileType)

    file_type.refresh_from_db()
    assert file_type.group == 'financial'
    assert file_type.is_default_suggestion is True


@pytest.mark.django_db
def test_file_types_endpoint_carries_grouping_for_the_picker():
    """
    The frontend groups and orders by what this endpoint says, and deliberately keeps no
    copy of the group list — so these four fields are the whole contract.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))

    res = client.get(reverse('filetype-list'))

    assert res.status_code == status.HTTP_200_OK
    rows = {row['key']: row for row in res.data['results']}

    acta = rows['acta_constitutiva']
    assert acta['group'] == 'legal'
    # Headings are in Spanish: they are printed directly above the Spanish document
    # names the UI shows, so an English heading there would be a language mix.
    assert acta['group_label'] == 'Legales / corporativos'
    assert acta['is_default_suggestion'] is True

    # Financials come before legal in the reading order the catalog declares.
    assert rows['bank_statement']['group_order'] < acta['group_order']


@pytest.mark.django_db
def test_file_types_endpoint_carries_both_labels_ordered_by_spanish():
    """
    The UI prints the Spanish name, so the list has to ARRIVE sorted by it — a list
    sorted by label_en looks shuffled to someone reading label_es. The English name is
    still served, unchanged, for a future language toggle.
    """
    org = make_org()
    client = make_client_for(make_user_in_org(org))

    res = client.get(reverse('filetype-list'))

    assert res.status_code == status.HTTP_200_OK
    rows = res.data['results']

    # Both names are present on every row.
    assert all(row['label_en'] and row['label_es'] for row in rows)

    # The Spanish name is the real one, not a copy of the English one.
    pagare = next(row for row in rows if row['key'] == 'pagare')
    assert pagare['label_en'] == 'Promissory note'
    assert pagare['label_es'] == 'Pagaré'

    # Sorted by the Spanish name. Compared through `alphabetical_key` because Postgres
    # does the sorting (FileType.Meta.ordering) and its default collation ignores case,
    # accents and spaces, which Python's plain `sorted` does not.
    spanish_names = [row['label_es'] for row in rows]
    assert spanish_names == sorted(spanish_names, key=alphabetical_key)

    # And it is really the SPANISH order: sorting by the English names would produce a
    # different list ("Pagaré" lands under P either way, but "Balance general" and
    # "Acta constitutiva" do not).
    english_names = [row['label_en'] for row in rows]
    assert english_names != sorted(english_names, key=alphabetical_key)


@pytest.mark.django_db
def test_credit_case_requirement_rows_carry_the_spanish_label():
    """
    A requirement row names its document inline, so the UI can render the list without
    cross-referencing /file-types/. That name has to include the Spanish one.
    """
    org = make_org()
    user = make_user_in_org(org)
    client = make_client_for(user)
    customer = make_customer(org)
    credit_case = make_credit_case(customer)
    CreditCaseRequirement.objects.create(
        credit_case=credit_case, file_type=global_file_type('pagare'),
    )

    res = client.get(reverse('creditcaserequirement-list'))

    assert res.status_code == status.HTTP_200_OK
    row = next(r for r in res.data['results'] if r['file_type_key'] == 'pagare')
    assert row['label_es'] == 'Pagaré'
    assert row['label_en'] == 'Promissory note'
