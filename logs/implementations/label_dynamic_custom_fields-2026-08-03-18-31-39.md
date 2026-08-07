# Implementation Log — label_dynamic_custom_fields — 2026-08-03

Redesigned `Label` from a hard-coded per-model M2M tag into a user-defined **dynamic custom field**:
a `Label` (e.g. "sucursal") is now a field *definition* scoped to exactly one model (CreditCase,
Customer, or UploadDocument), and a new `LabelValue` model holds the per-object value — at most one
per `(label, object)`, enforced by a DB unique constraint, so it behaves like a real model field.

## Files changed

### `backend/core/constants.py`
- Added `LABEL_VALUE_BASENAME = 'labelvalue'`.
- Added `LABELABLE_MODEL_ORG_LOOKUPS` — maps each labelable model's lowercase name to the ORM
  lookup path(s) back to `Organization`, used to enforce tenant isolation when a `LabelValue` is
  created against a target object.

### `backend/storage/models.py`
- `Label`: removed `value`, `credit_cases`, `customers`; added `organization` FK (nullable),
  `content_type` FK to `ContentType` (nullable, scopes the label to one model), `created_by` FK.
  Unique constraint on `(organization, content_type, name)`.
- New `LabelValue`: `label` FK, `content_type` FK (denormalized copy of `label.content_type`,
  needed because `GenericForeignKey`/`GenericRelation` require a real field to query against),
  `object_id` (`PositiveBigIntegerField`, matches `BigAutoField` PKs), `content_object` GFK, `value`,
  `created_at`, `updated_at`, `created_by`. Unique constraint on `(label, content_type, object_id)` —
  this is what makes it field-like: at most one value per label per object.
- `UploadDocument` gained `label_values = GenericRelation('storage.LabelValue')`.

### `backend/processing/models.py`, `backend/customers/models.py`
- `CreditCase.label_values` / `Customer.label_values` — same `GenericRelation`, added via the lazy
  `'storage.LabelValue'` string to avoid a circular import (both apps are imported by
  `storage/models.py`, so they can't import back).

### `backend/storage/migrations/0007_label_dynamic_custom_fields.py`
- Single migration (see deviation note below) doing everything from the plan's original two-step
  split: creates `LabelValue`, removes `Label.value`/`credit_cases`/`customers`, adds
  `Label.organization`/`content_type`/`created_by`, adds both unique constraints and the
  `LabelValue` index.
- Deliberately excludes the unrelated `AlterField` on `uploaddocument.file_type_name` that
  `makemigrations` also proposed — that field's `choices` list is built from a Python `set`
  (`core.constants.UPLOAD_DOCUMENT_FILE_TYPE_NAMES`), whose iteration order depends on the
  process's hash seed, so Django proposes a no-op reordering migration on almost every run. Verified
  this is pre-existing and unrelated to this feature, not something introduced here; left as a
  comment in the migration file for the next person who runs `makemigrations` and sees it again.

**Deviation from plan:** the plan called for two migrations (add columns, then remove the old M2M
fields) specifically to avoid a breaking single-step change. Once writing it, there was nothing to
backfill — the one pre-existing `Label` row had zero links to any CreditCase/Customer — so the two
steps were combined into one migration with no loss of safety.

**Data note (approved by user):** running the forward migration dropped the `value` column, which
still held one legacy row's data (`id=1, name='sucursal', value='mty nte'`, 0 links to anything).
This blocked a clean migration *reverse* test (Postgres can't repopulate a NOT NULL column with data
that no longer exists). Surfaced this to the user via `AskUserQuestion`; they approved deleting that
orphan row. Deleted via `Label.objects.filter(id=1, organization__isnull=True,
content_type__isnull=True).delete()` (scoped tightly to that exact stale row). Confirmed migration
reverses to `0006` and re-applies to `0007` cleanly afterward.

### `backend/storage/serializers.py`
- `LabelSerializer`: `content_type` is a `SlugRelatedField(slug_field='model', queryset=...filter(
  model__in=LABELABLE_MODEL_ORG_LOOKUPS))` — client sends/receives a model name like `"creditcase"`,
  never a raw ContentType id; an unsupported model name is auto-rejected by the queryset filter.
  `organization` is read-only (auto-set server-side).
- New `LabelValueSerializer`: `content_type` is read-only, derived from `label.content_type` (never
  client input, so it can't mismatch). `validate()` checks the target `(content_type, object_id)`
  object exists and is reachable from the requesting user's organizations via
  `LABELABLE_MODEL_ORG_LOOKUPS` — this is the tenant-isolation check.
- `UploadDocumentSerializer` gained `custom_fields` (`SerializerMethodField`, read-only) — a
  `{label_name: value}` dict built from `obj.label_values.select_related('label')`.

### `backend/processing/serializers.py`, `backend/customers/serializers.py`
- `CreditCaseSerializer` / `CustomerSerializer` gained the same `custom_fields` field, same pattern.
  Deliberately a dict (`{"sucursal": "MTY Norte"}`), not a list of `{id, name, value}` objects, so it
  reads like real fields on the object rather than a tag list.

### `backend/storage/views.py`
- `LabelViewSet`: `organization_lookup = 'organization'`; `perform_create` sets `organization`
  (from `request.user.organizations.first()`) and `created_by`, mirroring `CustomerViewSet`. Added
  `existing-values` `@action` (`GET /labels/{id}/existing-values/`) returning the distinct list of
  values already used for that label, so a user can quickly reuse "MTY Norte" instead of retyping a
  near-duplicate.
- New `LabelValueViewSet`: `organization_lookup = 'label__organization'`. `create()` is overridden
  to call `LabelValue.objects.update_or_create(label=..., content_type=..., object_id=...,
  defaults={'value': ...})` instead of a plain insert — POSTing a value for a `(label, object)` pair
  that already has one **updates it in place** (200) rather than raising a uniqueness conflict;
  POSTing a new one creates it (201). `created_by` is only set on actual creation (not overwritten on
  update, so it keeps tracking who originally set the field). Wrapped in `@transaction.atomic` per
  `docs/architecture/decisions.md`.

### `backend/storage/urls.py`
- Registered `label-values` → `LabelValueViewSet`, `basename=LABEL_VALUE_BASENAME`.

### `backend/processing/views.py`, `backend/customers/views.py`, `backend/storage/views.py`
- Added `.prefetch_related('label_values__label')` to the `CreditCase`, `Customer`, and
  `UploadDocument` viewset querysets so the new `custom_fields` field doesn't N+1.

### Tests (new)
- `backend/storage/tests/models/test_label.py` — DB-level: unique constraint blocks a second
  `LabelValue` for the same `(label, object)`; deleting a labeled `CreditCase` cascades away its
  `LabelValue` (proves the `GenericRelation`); two labels scoped to different models keep
  independent values even with the same name.
- `backend/storage/tests/views_serializers/test_label.py` — API-level (pytest-django,
  `APIClient.force_authenticate`): create a Label scoped to `creditcase`; reject a
  non-allowlisted content type (`"user"`); POSTing a `LabelValue` twice for the same `(label,
  object)` returns 201 then 200 and only leaves one row with the latest value; reject a target
  object belonging to another organization; reject a nonexistent `object_id`; `custom_fields`
  appears correctly on a CreditCase detail response; `existing-values` returns the distinct list.

### `docs/architecture/database.md`
- Updated the `Label` entry (now a field definition: name/organization/content_type/created_by) and
  added the new `LabelValue` entry, per `ai/agents/db.md`'s requirement to keep the ERD current.

## Verification
1. `docker compose exec backend python manage.py check` → clean.
2. `docker compose exec backend python manage.py migrate storage` → applied `0007` cleanly.
3. Migration reversibility: `migrate storage 0006` then `migrate storage 0007` → both succeeded
   (after the one orphan `Label` row was deleted per the user's approval — see data note above).
4. `docker compose exec backend pytest storage/tests/models/test_label.py
   storage/tests/views_serializers/test_label.py --create-db -v` → **10 passed**.
5. `docker compose exec backend pytest --continue-on-collection-errors -q` (full suite) →
   **72 passed, 6 skipped** (was 62 passed / 6 skipped before this feature — 72 = 62 + 10 new, no
   regressions).
6. `./scripts/sync-api-schema.sh` → `schema.yaml` validated; `api.generated.ts` regenerated with
   `Label`, `LabelValue`, `PaginatedLabelList`/`PaginatedLabelValueList`, `custom_fields` on
   CreditCase/Customer/UploadDocument, and the `existing-values` action all present.
7. `docker compose exec frontend npx tsc --noEmit` → one pre-existing, unrelated error
   (`.next/types/validator.ts` referencing a deleted `src/app/dashboard/page.js` — confirmed that
   path doesn't exist in source; this is stale `.next` build-cache drift, not caused by this
   change). No errors anywhere touching the regenerated API types.

## Notes / follow-ups (out of scope for this feature, left for later)
- No nested write path was added to set `custom_fields` directly through the
  CreditCase/Customer/UploadDocument serializers (e.g. `PATCH` a CreditCase with a `custom_fields`
  dict) — values are set/updated via the dedicated `LabelValueViewSet`. Could be added later if the
  frontend wants a single-request "save this object and its custom fields" flow.
- The `uploaddocument.file_type_name` `choices`-ordering migration noise (from
  `UPLOAD_DOCUMENT_FILE_TYPE_NAMES` being a `set`) is pre-existing and unrelated to this feature; it
  will keep showing up in `makemigrations --check` until `core/constants.py` builds that choices
  list from an ordered sequence instead of a `set`.
