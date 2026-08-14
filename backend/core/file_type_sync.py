"""
Copies the app's file type catalog (`core/file_type_catalog.py`) into the database.

Kept separate from both the management command and the data migration that call it, so
those two can't drift apart: a fresh database gets its file types from the migration,
and an existing one gets newly added types from `manage.py sync_file_types`, but both
run this exact code.
"""

from .file_type_catalog import FILE_TYPE_CATALOG


# The catalog fields that are safe to overwrite on an existing row. `key` is deliberately
# absent: it is the value already stored in every UploadDocument.file_type_name, so
# changing it would orphan those documents. Renaming means editing the labels only.
SYNCABLE_FIELDS = (
    'label_en',
    'label_es',
    'category',
    'months_required',
)


def sync_global_file_types(file_type_model):
    """
    Create or update the app-provided (global) FileType rows to match the catalog.

    `file_type_model` is passed in rather than imported so that data migrations can hand
    over their historical version of the model, which is what Django requires.

    Only ever creates and updates. Rows are never deleted or deactivated here, because
    uploaded documents reference a file type by key forever — removing one would leave
    those documents pointing at nothing. Organization-owned rows (organization not null)
    are left completely alone.

    Returns a (created, updated, unchanged) count tuple, so callers can report what
    happened and tests can assert that running it twice changes nothing.
    """
    created = updated = unchanged = 0

    for spec in FILE_TYPE_CATALOG:
        # 'unknown' is the classifier's fallback bucket, not a document anyone can hand
        # over, so it must never appear as something a credit case could require.
        if not spec.is_requirable:
            continue

        wanted = {field: getattr(spec, field) for field in SYNCABLE_FIELDS}

        obj, was_created = file_type_model.objects.get_or_create(
            key=spec.key,
            organization=None,
            defaults=wanted,
        )

        if was_created:
            created += 1
            continue

        changed = [f for f, value in wanted.items() if getattr(obj, f) != value]
        if changed:
            for field in changed:
                setattr(obj, field, wanted[field])
            obj.save(update_fields=changed)
            updated += 1
        else:
            unchanged += 1

    return created, updated, unchanged
