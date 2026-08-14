"""
Seeding, diffing and re-syncing of credit case document requirements.

The model here is deliberately copy-on-create rather than live-reference: a credit case
holds its OWN requirement rows, copied from a RequirementTemplate when the case is
created. That keeps the history of a reviewed case truthful when the template is edited
later, and lets a user add a one-off requirement for a particular customer.

The cost of copying is that a template edit does not reach existing cases by itself.
That is what the diff/apply pair below is for: the user is shown exactly what would
change and chooses which open cases to update.
"""

from django.db import transaction
from django.utils import timezone

from processing.models import CreditCase
from storage.models import CreditCaseRequirement, UploadDocument


def open_cases_for_template(template):
    """
    The credit cases a template edit may still be applied to.

    "Open" means `submitted_at is null` — once a case has been submitted for human
    approval, its requirement list is the evidence the reviewer worked from, so changing
    it after the fact would rewrite the basis of a decision.

    Only cases actually seeded from THIS template are included; an organization can keep
    several templates, and editing one should not disturb cases built from another.
    """
    return (
        CreditCase.objects.filter(
            submitted_at__isnull=True,
            requirements__source_template=template,
        )
        .distinct()
        .prefetch_related('requirements__file_type')
    )


@transaction.atomic
def seed_requirements_from_template(credit_case, template, user=None):
    """
    Copy a template's items onto a newly created credit case.

    Existing requirements are left alone (`ignore_conflicts`), so calling this twice
    can't produce duplicates — `unique(credit_case, file_type)` would reject them anyway.

    Returns the number of requirement rows created.
    """
    if template is None:
        return 0

    rows = [
        CreditCaseRequirement(
            credit_case=credit_case,
            file_type=item.file_type,
            is_required=item.is_required,
            months_required=item.months_required,
            source=CreditCaseRequirement.Source.TEMPLATE,
            source_template=template,
            created_by=user,
        )
        for item in template.items.select_related('file_type')
    ]
    created = CreditCaseRequirement.objects.bulk_create(rows, ignore_conflicts=True)
    return len(created)


def diff_template_against_case(template, credit_case):
    """
    Work out what would change if this template were re-applied to this credit case.

    The diff is computed live, by comparing the template to the case's CURRENT rows,
    rather than by replaying whatever the user just edited. That means a run of edits
    produces one coherent answer, re-applying is harmless, and a user who declines today
    can still sync later without anything having been recorded in the meantime.

    Requirements the user added by hand (`source='manual'`) are invisible to this diff —
    they are never added, removed or changed by a re-sync.

    Returns a dict with:
        adds     - file types in the template that the case doesn't have at all
        removes  - template-sourced rows on the case that the template no longer lists
        updates  - rows whose is_required/months_required no longer match the template
    """
    items_by_file_type = {
        item.file_type_id: item
        for item in template.items.select_related('file_type')
    }
    requirements = list(credit_case.requirements.select_related('file_type'))

    # Any existing row blocks an add, whatever its source: a manual row for the same
    # file type already covers that requirement, and unique(credit_case, file_type)
    # would reject a second one regardless.
    present_file_type_ids = {req.file_type_id for req in requirements}

    template_sourced = [
        req for req in requirements
        if req.source == CreditCaseRequirement.Source.TEMPLATE
    ]

    adds = [
        item.file_type
        for file_type_id, item in items_by_file_type.items()
        if file_type_id not in present_file_type_ids
    ]
    removes = [
        req.file_type
        for req in template_sourced
        if req.file_type_id not in items_by_file_type
    ]
    updates = [
        req.file_type
        for req in template_sourced
        if req.file_type_id in items_by_file_type
        and (
            req.is_required != items_by_file_type[req.file_type_id].is_required
            or req.months_required != items_by_file_type[req.file_type_id].months_required
        )
    ]

    return {'adds': adds, 'removes': removes, 'updates': updates}


def file_types_with_uploads(credit_case, file_types):
    """
    Of the given file types, which ones this case already has a document uploaded for.

    Used to warn before applying: removing a requirement the customer already satisfied
    leaves that document in place but no longer counting toward anything, which the user
    should see before confirming rather than discover afterwards.
    """
    if not file_types:
        return []

    keys = {file_type.key for file_type in file_types}
    uploaded = set(
        UploadDocument.objects
        .filter(credit_case=credit_case, file_type_name__in=keys)
        .values_list('file_type_name', flat=True)
    )
    return [file_type for file_type in file_types if file_type.key in uploaded]


@transaction.atomic
def apply_template_to_case(template, credit_case, user=None):
    """
    Bring one credit case's template-sourced requirements in line with the template.

    Deliberately does NOT touch `credit_case.status`: adding a requirement to a case
    already in review would otherwise knock it backwards out of the pipeline. The case
    simply reports the new document as missing until it is uploaded.

    Returns the same shape as `diff_template_against_case`, describing what was applied.
    """
    diff = diff_template_against_case(template, credit_case)
    now = timezone.now()

    if diff['removes']:
        credit_case.requirements.filter(
            source=CreditCaseRequirement.Source.TEMPLATE,
            file_type__in=diff['removes'],
        ).delete()

    if diff['adds']:
        items_by_file_type = {
            item.file_type_id: item for item in template.items.all()
        }
        CreditCaseRequirement.objects.bulk_create(
            [
                CreditCaseRequirement(
                    credit_case=credit_case,
                    file_type=file_type,
                    is_required=items_by_file_type[file_type.id].is_required,
                    months_required=items_by_file_type[file_type.id].months_required,
                    source=CreditCaseRequirement.Source.TEMPLATE,
                    source_template=template,
                    created_by=user,
                    synced_at=now,
                )
                for file_type in diff['adds']
            ],
            ignore_conflicts=True,
        )

    if diff['updates']:
        items_by_file_type = {
            item.file_type_id: item for item in template.items.all()
        }
        for requirement in credit_case.requirements.filter(
            source=CreditCaseRequirement.Source.TEMPLATE,
            file_type__in=diff['updates'],
        ):
            item = items_by_file_type[requirement.file_type_id]
            requirement.is_required = item.is_required
            requirement.months_required = item.months_required
            requirement.synced_at = now
            requirement.created_by = requirement.created_by or user
            requirement.save(
                update_fields=['is_required', 'months_required', 'synced_at', 'created_by']
            )

    return diff


@transaction.atomic
def replace_requirements_with_file_types(credit_case, file_types, user=None):
    """
    Make a credit case require exactly the given file types, and nothing else.

    Used when a user picks documents by hand for one particular customer instead of
    accepting their organization's default template. Rows are added as `source='manual'`
    on purpose: the case has deliberately opted out of the default, so a later template
    re-sync must leave it alone (`open_cases_for_template()` only looks at rows carrying
    a `source_template`).

    Requirements already present for a listed file type are kept as they are, so a case
    that started from the template and is then narrowed by hand does not churn rows it
    did not need to.

    Returns a (added, removed) count tuple.
    """
    wanted_ids = {file_type.id for file_type in file_types}

    existing = {
        requirement.file_type_id: requirement
        for requirement in credit_case.requirements.all()
    }

    removed, _ = credit_case.requirements.exclude(file_type_id__in=wanted_ids).delete()

    added = CreditCaseRequirement.objects.bulk_create(
        [
            CreditCaseRequirement(
                credit_case=credit_case,
                file_type=file_type,
                is_required=True,
                source=CreditCaseRequirement.Source.MANUAL,
                created_by=user,
            )
            for file_type in file_types
            if file_type.id not in existing
        ],
        ignore_conflicts=True,
    )

    return len(added), removed


@transaction.atomic
def reseed_requirements_from_template(credit_case, template, user=None):
    """
    Replace a credit case's requirements with a fresh copy of a template.

    Used when a user accepts their organization's default rather than choosing documents
    by hand. Unlike `replace_requirements_with_file_types`, rows land as
    `source='template'` with `source_template` set, so this case stays eligible for the
    template's future impact/apply re-syncs.
    """
    credit_case.requirements.all().delete()
    return seed_requirements_from_template(credit_case, template, user=user)
