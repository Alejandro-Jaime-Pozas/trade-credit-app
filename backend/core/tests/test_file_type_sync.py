"""
Guards on the catalog sync being safe to call from a data migration.

`sync_global_file_types` is called from three places: the management command, migration
0009 (which seeds the rows on a fresh database), and any later migration that adds a
catalog field. The last two hand it a HISTORICAL model — the version of FileType as it
existed at that point in the migration history — which is the whole reason the function
takes the model as an argument instead of importing it.

That is easy to break silently: adding a field to `SYNCABLE_FIELDS` makes migration 0009
write a column that does not exist yet, and `manage.py migrate` dies on any fresh
database. It happened when `group` and `is_default_suggestion` were added. These tests
pin the fix so the next added field cannot repeat it.
"""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from core.file_type_sync import SYNCABLE_FIELDS, sync_global_file_types, syncable_fields_for
from storage.models import FileType


# The state just before migration 0009 seeds the file types — FileType exists, but the
# fields added by 0011 do not.
BEFORE_SEEDING = ('storage', '0008_file_type_and_requirements')

FIELDS_ADDED_LATER = ('group', 'is_default_suggestion')


def historical_file_type(migration):
    """The version of storage.FileType as of `migration`, exactly as a data migration sees it."""
    executor = MigrationExecutor(connection)
    return executor.loader.project_state(migration).apps.get_model('storage', 'FileType')


@pytest.mark.django_db
def test_an_early_historical_model_is_not_asked_for_fields_it_lacks():
    model = historical_file_type(BEFORE_SEEDING)

    fields = syncable_fields_for(model)

    for field in FIELDS_ADDED_LATER:
        assert field not in fields
    # The fields that DID exist then are still written, so seeding is unaffected.
    assert 'label_en' in fields
    assert 'category' in fields


@pytest.mark.django_db
def test_the_current_model_is_synced_with_every_catalog_field():
    """The filtering must narrow only for old models, never quietly skip a live field."""
    assert syncable_fields_for(FileType) == SYNCABLE_FIELDS


@pytest.mark.django_db
def test_seeding_from_an_early_migration_does_not_crash():
    """
    The actual regression. This raised
    `FieldError: Invalid field name(s) for model FileType: 'group', 'is_default_suggestion'`
    and took `manage.py migrate` down with it on every fresh database.
    """
    model = historical_file_type(BEFORE_SEEDING)

    created, updated, unchanged = sync_global_file_types(model)

    assert created + updated + unchanged > 0


@pytest.mark.django_db
def test_a_later_migration_fills_in_the_field_it_added():
    """
    The other half of the contract: 0009 leaves the new fields alone, so the migration
    that adds them has to populate them — which it does by re-running this same helper,
    against a model version that by then does have the columns.
    """
    fields = syncable_fields_for(historical_file_type(('storage', '0011_filetype_group_filetype_is_default_suggestion')))

    for field in FIELDS_ADDED_LATER:
        assert field in fields
