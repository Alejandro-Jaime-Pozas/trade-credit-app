"""
Populate the new requirement tables so nothing regresses for data that already exists.

Three steps:
  1. Seed the app-provided (global) FileType rows from the catalog.
  2. Give every existing organization a "Default" requirement template holding the same
     five document types that used to be hardcoded for every credit case.
  3. Copy that template onto every existing credit case, so cases keep reporting the
     exact same required documents as before this feature.

Without step 3, every credit case in the database would suddenly report zero required
documents, because `CreditCase.required_file_type_names` now reads from these rows
instead of from a Python constant.
"""

from django.db import migrations

from core.file_type_spec import DEFAULT_SUGGESTION_KEYS
from core.file_type_sync import sync_global_file_types


DEFAULT_TEMPLATE_NAME = 'Default'


def seed_and_backfill(apps, schema_editor):
    FileType = apps.get_model('storage', 'FileType')
    RequirementTemplate = apps.get_model('storage', 'RequirementTemplate')
    RequirementTemplateItem = apps.get_model('storage', 'RequirementTemplateItem')
    CreditCaseRequirement = apps.get_model('storage', 'CreditCaseRequirement')
    Organization = apps.get_model('identity', 'Organization')
    CreditCase = apps.get_model('processing', 'CreditCase')

    # 1. Global file types.
    sync_global_file_types(FileType)

    default_file_types = list(
        FileType.objects.filter(organization=None, key__in=DEFAULT_SUGGESTION_KEYS)
    )
    if not default_file_types:
        return

    for organization in Organization.objects.all():
        # 2. One default template per organization, holding today's five types.
        template, _ = RequirementTemplate.objects.get_or_create(
            organization=organization,
            name=DEFAULT_TEMPLATE_NAME,
            defaults={'is_default': True},
        )
        RequirementTemplateItem.objects.bulk_create(
            [
                RequirementTemplateItem(
                    template=template,
                    file_type=file_type,
                    is_required=True,
                    order=order,
                )
                for order, file_type in enumerate(default_file_types)
            ],
            ignore_conflicts=True,
        )

        # 3. The same list copied onto each of that organization's existing cases.
        credit_cases = CreditCase.objects.filter(customer__organization=organization)
        CreditCaseRequirement.objects.bulk_create(
            [
                CreditCaseRequirement(
                    credit_case=credit_case,
                    file_type=file_type,
                    is_required=True,
                    source='template',
                    source_template=template,
                )
                for credit_case in credit_cases
                for file_type in default_file_types
            ],
            ignore_conflicts=True,
        )


def unseed(apps, schema_editor):
    """
    Reverse by removing only what this migration created: the seeded requirements, the
    default templates, and the global file types. Organization-owned file types and
    manually added requirements are left alone, since this migration never made them.
    """
    FileType = apps.get_model('storage', 'FileType')
    RequirementTemplate = apps.get_model('storage', 'RequirementTemplate')
    CreditCaseRequirement = apps.get_model('storage', 'CreditCaseRequirement')

    CreditCaseRequirement.objects.filter(source='template').delete()
    RequirementTemplate.objects.filter(name=DEFAULT_TEMPLATE_NAME).delete()
    FileType.objects.filter(organization=None).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('storage', '0008_file_type_and_requirements'),
        ('identity', '0001_initial'),
        ('processing', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_and_backfill, unseed),
    ]
