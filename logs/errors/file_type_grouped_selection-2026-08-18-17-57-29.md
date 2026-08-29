# Error — `migrate` crashed on a fresh database — 2026-08-18 17:57:29

Introduced by the file type grouping work
(`logs/implementations/file_type_grouped_selection-2026-08-17-20-15-47.md`). The backend
container could not start.

## Symptom

```
django.core.exceptions.FieldError: Invalid field name(s) for model FileType:
'group', 'is_default_suggestion'.
  File "/backend/storage/migrations/0009_seed_file_types_and_backfill_requirements.py",
    line 34, in seed_and_backfill
    sync_global_file_types(FileType)
```

## Cause

`sync_global_file_types` writes every field in `SYNCABLE_FIELDS`, and I added `group` and
`is_default_suggestion` to that tuple. But the helper is deliberately handed a HISTORICAL
model by data migrations — the version of `FileType` as it existed at that point in the
migration history. Migration `0009` seeds the rows two migrations before `0011` adds those
columns, so on a database migrating from zero it was asked to write fields that did not
exist yet.

Existing databases were fine: their `0009` had already run. Only a fresh one broke, which
is the case that matters for anyone setting the project up.

## Why the tests did not catch it

`backend/pytest.ini` sets `addopts = --reuse-db`, with a comment saying to add
`--create-db` after model/migration changes. My test database predated migration `0011`,
so `0009` was never re-run from scratch and the suite passed at 216. Running
`pytest --create-db` reproduces the failure immediately. I did not follow the note that
was already there.

## Fix

`core/file_type_sync.py` — new `syncable_fields_for(file_type_model)` returns only the
catalog fields the given model version actually has, and `sync_global_file_types` writes
those. Migration `0009` therefore seeds the columns that exist at its point in history,
and `0011` — which re-runs the same helper after adding the columns — fills in the rest.

Filtering inside the helper rather than at each call site means the next catalog field
added cannot repeat this.

## Verification

- Created a scratch database and ran `manage.py migrate` against it from zero: completes,
  and ends with 22 file types, 11 suggested, none stranded in the fallback "other" group.
  Scratch database dropped afterwards; the app database was never touched.
- `pytest --create-db` (rebuilds the test database through every migration): **220 passed,
  6 skipped**.
- The backend container starts and serves again.
- Four regression tests in `core/tests/test_file_type_sync.py`, built on the real
  migration state via `MigrationExecutor`, covering both halves of the contract: an early
  historical model is not asked for fields it lacks, the current model still gets every
  field, seeding from `0008`'s state does not raise, and the model at `0011` does have the
  new fields to fill in. Confirmed non-vacuous by restoring the old behaviour in memory
  and watching them fail.
