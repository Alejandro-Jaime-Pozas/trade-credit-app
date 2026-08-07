# Plan: `Label` → dynamic custom fields (per-model field definitions + one value per object)

> Deviation from plan during implementation: the plan called for two migrations (`0007` adding
> `Label.organization`/`content_type` + `LabelValue`, `0008` removing the old M2M fields) to avoid a
> breaking single-step change. Once implementing, there turned out to be nothing to backfill (the
> sole pre-existing `Label` row had zero links), so both steps were combined into one migration:
> `backend/storage/migrations/0007_label_dynamic_custom_fields.py`. See the implementation log for
> the full reasoning and the (approved) deletion of that one orphan row.

## Context / design change from earlier draft

Earlier direction (already superseded, do not implement): a generic contenttypes tagging system
where `Label` was a `(name, value)` row and a `LabelAssignment` linked it to any number of objects —
i.e. multi-value tags.

**Corrected requirement (confirmed with user):** a label must behave as a **dynamic custom field**.
A user creates a label like "sucursal" for CreditCase, and from then on every CreditCase effectively
has a "sucursal" field — one value per object, settable, updatable, and quickly reusable (if "MTY
Norte" was already used as a sucursal value, the user should be able to look it up and reuse it
rather than retyping it).

Confirmed answers this round:
- **Values are freeform text**, not a managed/predefined options list — but the API must offer a way
  to list distinct existing values already used for a given label, so the user can quickly pick an
  existing one instead of typing a near-duplicate. No separate "options" model — this is just a
  distinct-values query over existing values.
- **A label definition is scoped to exactly one model** (e.g. "sucursal" is defined for CreditCase
  specifically) — not reusable across CreditCase/Customer/UploadDocument. This matches "treated as a
  field on CreditCase" much more directly than a cross-model tag would.

Scope reconfirmed (unchanged from before): **full backend, no UI**; labelable models remain
`CreditCase`, `Customer`, `UploadDocument`.

## Key constraints found during exploration (unchanged from earlier analysis)

1. **`OrganizationScopedMixin` cannot traverse a `GenericForeignKey`** (`app/mixins.py` builds
   `queryset.filter(**{f'{lookup}__in': ...})`, a GFK isn't a real join path). → Both new models get a
   real FK path to `Organization` (`Label.organization` directly; `LabelValue.label.organization`).
2. **Circular import:** `storage/models.py` already imports `CreditCase` and `Customer`; those apps
   can't import back. → `GenericRelation('storage.LabelValue')` (lazy string form) added to each
   labelable model.
3. **Never expose raw ContentType ids** — serializers take/return the model name (e.g. `"creditcase"`)
   via `SlugRelatedField(slug_field='model')`.
4. **`DEFAULT_AUTO_FIELD = BigAutoField`** (`app/settings.py:233`) → `object_id` must be
   `PositiveBigIntegerField`.
5. **`ai/agents/db.md`:** migrations only, no breaking migration without backfill plan, FKs indexed,
   tenant isolation preserved, update the ERD in `docs/architecture/database.md`.
6. **`docs/architecture/decisions.md`:** multi-step DB writes get `@transaction.atomic`.
7. **Existing data:** exactly 1 `Label` row (`sucursal` / `mty nte`), 0 links to anything, so it has no
   derivable organization or content type. It will be left as-is (nullable columns), surfaced to you at
   implementation time to fix or delete manually — not touched automatically.

## Changes

### 1. Models — `backend/storage/models.py`

`Label` becomes the **field definition** — remove `value`, `credit_cases`, `customers`; add:

```python
class Label(models.Model):
    name = CharField(max_length=50, help_text='The field name, e.g. "sucursal".')
    organization = FK(Organization, on_delete=CASCADE, related_name='labels', null=True, blank=True)
    content_type = FK(ContentType, on_delete=CASCADE, related_name='+', null=True, blank=True,
                       help_text='The single model this custom field applies to, e.g. CreditCase.')
    created_at = DateTimeField(auto_now_add=True)
    created_by = FK(User, on_delete=SET_NULL, null=True, blank=True)

    class Meta:
        constraints = [UniqueConstraint(['organization', 'content_type', 'name'],
                                         name='unique_label_per_org_and_model')]
```

(`organization`/`content_type` stay nullable at the DB level only to accommodate the one pre-existing
untyped row without a breaking migration; the API always requires both on create.)

New `LabelValue` — the **per-object field value**:

```python
class LabelValue(models.Model):
    label = FK(Label, on_delete=CASCADE, related_name='values')
    content_type = FK(ContentType, on_delete=CASCADE)  # denormalized, always == label.content_type;
                                                          # required so GenericRelation/GFK can query it
    object_id = PositiveBigIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    value = CharField(max_length=250, help_text='The field value, e.g. "MTY Norte".')
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    created_by = FK(User, on_delete=SET_NULL, null=True, blank=True)

    class Meta:
        indexes = [Index(fields=['content_type', 'object_id'])]
        constraints = [UniqueConstraint(['label', 'content_type', 'object_id'],
                                         name='unique_value_per_label_per_object')]
```

The unique constraint is what makes this "field-like": an object can have at most one `LabelValue`
row per `Label`. Setting it again **updates** the existing row rather than creating a second one (see
Views section — `update_or_create`, not `create`).

Add to each labelable model (so deleting the object cascades its values, and to expose them):
- `CreditCase` (`processing/models.py`), `Customer` (`customers/models.py`),
  `UploadDocument` (`storage/models.py`):
  `label_values = GenericRelation('storage.LabelValue')`

### 2. Allowlist constants — `backend/core/constants.py`

```python
LABELABLE_MODEL_ORG_LOOKUPS = {
    'creditcase':     ['customer__organization'],
    'customer':       ['organization'],
    'uploaddocument': ['customer__organization', 'credit_case__customer__organization'],
}
```
(`UploadDocument` needs both paths — `customer`/`credit_case` are each nullable, matching the existing
TODO on `UploadDocumentViewSet.organization_lookup`.) Also add
`LABEL_VALUE_BASENAME = 'labelvalue'`.

### 3. Migrations — `backend/storage/migrations/` (latest is `0006`)

- **`0007_label_content_type_and_labelvalue.py`** — `AddField` `Label.organization` (nullable, was
  already planned before) + `AddField` `Label.content_type` (nullable FK to contenttypes); `RemoveField`
  `Label.value` (dropped — value now lives on `LabelValue`); `CreateModel` `LabelValue` with its
  index/constraint. Depends on `contenttypes.0002_remove_content_type_name`.
- **`0008_remove_label_m2m_fields.py`** — `RemoveField` `credit_cases`, `customers` from `Label`.

Two migrations instead of three this time since there's no M2M data to backfill into the new shape
(the one existing row has zero links — nothing to migrate, `Label.value='mty nte'` is simply dropped
with that row; I'll flag this row to you before running migrations in case you want to keep the value
elsewhere first).

`pytest.ini` uses `--reuse-db` → first run after this needs `pytest --create-db`.

### 4. Serializers — `backend/storage/serializers.py`

- `LabelSerializer`: `name`, `content_type` (`SlugRelatedField(slug_field='model',
  queryset=ContentType.objects.filter(model__in=LABELABLE_MODEL_ORG_LOOKUPS))`), `organization`
  (read-only), `created_at`. `validate()` restricts `content_type` to the allowlist.
- New `LabelValueSerializer`: `label` (PK, queryset scoped to the requesting user's org labels),
  `object_id`, `value`, `created_at`, `updated_at`. `content_type` is **not** a client input — derived
  from `label.content_type` in `create()`, so it can never mismatch. `validate()` confirms the target
  `(content_type, object_id)` row exists and is reachable from the user's organizations via
  `LABELABLE_MODEL_ORG_LOOKUPS` (rejects cross-tenant assignment).
- New read-only action on `LabelViewSet`: `GET /labels/{id}/existing-values/` → distinct list of
  values already used for that label (`LabelValue.objects.filter(label=label).values_list('value',
  flat=True).distinct().order_by('value')`), enabling "reuse MTY Norte instead of retyping it."
- Read side on the labelable models — `CreditCaseSerializer` (`processing/serializers.py`),
  `CustomerSerializer`, `UploadDocumentSerializer`: add a read-only
  `custom_fields = SerializerMethodField()` returning a **name → value dict**
  (`{'sucursal': 'MTY Norte'}`), sourced from `obj.label_values.select_related('label')` — deliberately
  a dict, not a list of `{id,name,value}` objects, since it's meant to read like real model fields.
  Mirror the existing typed-annotation style (`def get_required_file_type_names(self, obj) ->
  list[str]`, `processing/serializers.py:38`) so drf-spectacular types it (`dict[str, str]`).

### 5. Views / routing

- `LabelViewSet` (`storage/views.py`): `organization_lookup = 'organization'`; `perform_create` sets
  `organization=self.request.user.organizations.first()`, `created_by=self.request.user` (mirrors
  `CustomerViewSet`); add `existing-values` `@action`.
- New `LabelValueViewSet` (`OrganizationScopedMixin + ModelViewSet`):
  `organization_lookup = 'label__organization'`. **`create()` override does `update_or_create` keyed
  on `(label, content_type, object_id)`** instead of a plain insert — this is the field semantic: POSTing
  a value for a label that's already set on that object overwrites it (200) rather than raising a
  uniqueness conflict; POSTing where none exists creates it (201). `content_type` is set from
  `label.content_type` server-side. Supports filtering by `?content_type=&object_id=`.
- Register in `backend/storage/urls.py`: `router.register('label-values', LabelValueViewSet,
  basename=LABEL_VALUE_BASENAME)`.
- Add `prefetch_related('label_values__label')` to the CreditCase, Customer, and UploadDocument
  viewsets so `custom_fields` doesn't N+1.

### 6. Tests — `backend/storage/tests/` (pytest function style, matching the two most recent test files)

- `models/test_label.py` — `(label, content_type, object_id)` uniqueness constraint at the DB level;
  deleting a labeled `CreditCase` cascades away its `LabelValue`s (proves the `GenericRelation`); two
  different labels (scoped to two different models) can each have their own values independently.
- `views_serializers/test_label.py` — create a Label scoped to `creditcase`; reject a
  non-allowlisted content type; setting a `LabelValue` twice for the same `(label, object)` updates in
  place rather than erroring; reject a target object in another organization (tenant isolation); reject
  a nonexistent `object_id`; `custom_fields` dict appears correctly on CreditCase/Customer/UploadDocument
  detail payloads; `existing-values` action returns the distinct value list.

### 7. Docs + generated artifacts

- Update `Label` and add `LabelValue` in `docs/architecture/database.md` (required by `ai/agents/db.md`).
- Regenerate the API contract: `./scripts/sync-api-schema.sh` (`manage.py spectacular --file
  schema.yaml --validate` then `npm run api:generate`). No component reads the current `Label` type, so
  no UI breakage, but `api.generated.ts` must be regenerated since the shape changes completely.
- Feature logs per `ai/execution_context/feature_context.md`: `logs/prompts|plans|implementations/` as
  `label_dynamic_custom_fields-<timestamp>.md`.

## Out of scope
- No React/UI work.
- Not adding a nested write path to set `custom_fields` directly through the CreditCase/Customer/
  UploadDocument serializers (e.g. `PATCH` a CreditCase with a `custom_fields` dict) — values are
  set/updated via the dedicated `LabelValueViewSet` for now. Can be added later if needed.
- Not adding a managed/predefined-options model — "reuse an existing value" is served by the
  `existing-values` distinct-query action, not a constrained choice field.
- Not moving `Label` out of the `storage` app.

## Verification
1. `docker compose exec backend python manage.py makemigrations --check --dry-run` → clean after the
   two migrations are written; `manage.py migrate` applies cleanly.
2. `docker compose exec backend pytest --create-db -q` → new label tests pass, current baseline
   (62 passed / 6 skipped) holds with no regressions.
3. `docker compose exec backend python manage.py migrate storage 0006` → confirms the reverse path
   works (then migrate forward again).
4. `./scripts/sync-api-schema.sh` → `schema.yaml` validates and `api.generated.ts` regenerates;
   `cd frontend && npx tsc --noEmit` stays clean.
5. Manual API check against the running stack (DRF browsable UI or curl, authenticated): create a
   Label scoped to `creditcase` named "sucursal"; POST a `LabelValue` for a real CreditCase; confirm it
   appears in that CreditCase's `custom_fields`; POST again with a different value for the same
   `(label, object)` and confirm it updates in place instead of erroring; confirm `existing-values`
   lists it; confirm assigning to another organization's CreditCase returns 400.
