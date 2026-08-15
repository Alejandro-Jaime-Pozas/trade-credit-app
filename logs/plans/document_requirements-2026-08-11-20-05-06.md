# Plan: User-defined document requirements (file type catalog → org templates → per-case snapshots)

## Context

`docs/versions/v1.md` tracks an unimplemented item: *"user can modify strict requirements to consider
solicitud as complete."* Today every credit case requires the same five documents, hardcoded as a
Python `set` — `CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED` (`backend/core/constants.py:5`), returned
verbatim by `CreditCase.required_file_type_names` (`backend/processing/models.py:114`). An org cannot
say "we also need Poderes Notariados" or "we don't ask for cashflow statements."

Two problems block that:

1. **That one `set` is doing four unrelated jobs** — it is the catalog of what file types exist, the
   `FileTypeName` TextChoices on `UploadDocument.file_type_name`, the GPT classifier's allowed output
   (`Literal[*UPLOAD_DOCUMENT_FILE_TYPE_NAMES]`, `file_type_models.py:122`), *and* the requirement list.
   Only the last is meant to become per-org. A file type's key is currently repeated across five files
   (`core/constants.py` ×3, `frontend/src/lib/constants.ts`, `db_object_handling.py`).
2. **Requirements have no per-case identity**, so there is nowhere to record a deviation and no way to
   tell what a case required at the time it was reviewed.

Outcome: an org picks its own default requirement template during onboarding; each credit case gets a
**snapshot** of that template it can then deviate from; editing the template later offers a reviewed,
opt-in re-sync onto open cases only.

Being a credit-approval system, requirement history must stay truthful — a case approved against five
documents must not silently read as "required seven" after a later template edit. That is why cases get
copied rows rather than a template FK.

## Decisions already settled with the user

| Decision | Choice |
|---|---|
| Case ↔ template link | **Snapshot rows**, not an FK — audit integrity + per-case deviation |
| Re-sync diff | Computed **live** (template vs. case rows), never a changelog — idempotent, one prompt per save, "sync later" free |
| "Open" case (re-syncable) | `submitted_at is null` — the moment the checklist became decision evidence |
| Status on re-sync | **Never auto-regresses**; `missing_file_type_names` tells the truth instead |
| Template ownership | **Org-level**, with `created_by`; multiple named templates, one `is_default` |
| Existing data | **Backfill** every org + case with today's five types, so nothing regresses |
| Audit trail | Yes — `created_by` / `synced_at` on requirement rows |
| Global file types | App-owned, **never deactivated**; labels renamable, **keys immutable** (keys are the join stored in `UploadDocument.file_type_name`) |
| Global types in a template | **Opt-in suggestions**, not forced |
| User-created file types | **Deferred** — needs its own extraction schema. Architecture must not block it |
| Org type shadowing a global | Deferred with the above |
| Scope | **Backend only** (confirmed) |
| Catalog depth | **Data attributes only** (confirmed) — leaves the friendly-file-name `if/elif` chain alone |

## 1. Single source of truth — `backend/core/file_type_catalog.py` (new)

The user will supply a longer list of file types later; adding one must mean editing **one** place.

```python
@dataclass(frozen=True)
class FileTypeSpec:
    key: str                  # immutable; the string stored in UploadDocument.file_type_name
    label_en: str
    label_es: str
    category: str             # 'financial' | 'legal' | 'other'
    pydantic_model: type      # extraction schema for GPT
    months_required: int | None = None
    is_default_suggestion: bool = False   # pre-ticked in onboarding

FILE_TYPE_CATALOG: tuple[FileTypeSpec, ...] = (...)   # ordered tuple, NOT a set
```

Everything else derives from it in that same module: `FILE_TYPE_KEYS`, `get_spec(key)`,
`PYDANTIC_BY_KEY`, `DEFAULT_SUGGESTION_KEYS`. Ordering is deterministic, which also kills the recurring
phantom `AlterField` on `uploaddocument.file_type_name` caused by the current `set`'s hash ordering.

Deleted from `core/constants.py`, all call sites repointed at the catalog:
`CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED`, `UPLOAD_DOCUMENT_FILE_TYPE_NAMES`,
`LOAN_FILE_MONTHS_REQUIRED_FINANCIALS`, `LOAN_FILE_MONTHS_REQUIRED_LEGAL`,
`FILE_TYPE_NAME_MAPPING_PYDANTIC`. `MAX_FILE_MONTHS_BACK_*` becomes category-driven.

Call sites to update: `processing/models.py` (both `required_file_type_names` properties, lines ~114
and ~219, plus `all_files_required_dates_complete`), `integrations/openai/services/gpt.py:45,161`,
`file_type_models.py:122`, `processing/tests/models/test_account_application.py:61-64`.

**Drop `choices=` from `UploadDocument.file_type_name`** (`storage/models.py:64`) and delete
`FileTypeName` from `storage/choices_for_models.py` — a DB-backed catalog can't be a static enum.
Stays a `CharField`; validated against the catalog in the serializer. String comparisons in
`db_object_handling.py:185-215` are untouched and keep working.

**`FileTypeNamePydantic`'s `Literal` moves to call time** — `gpt.py:45` computes
`FILE_TYPE_NAME_SCHEMA` at import, which freezes the allowed set. Build it per request from the active
catalog instead. Small change now; it is the hook the deferred user-created-types story hangs on.

## 2. Models — all four in `backend/storage/models.py`

`storage` already imports `processing` and `customers`, so a direct `CreditCase` FK works and there is
no circular import to route around. `CreditCase` reaches its requirements through the reverse accessor,
needing no import.

- **`FileType`** — catalog row. `key`, `label_en`, `label_es`, `category`, `months_required`,
  `is_active`, `organization` (**null = app-global**), `created_by`, `created_at`.
  Constraints: `unique(organization, key)` **plus a partial unique index on `key WHERE organization IS
  NULL`** — Postgres treats NULLs as distinct, so the composite constraint alone will not stop two
  duplicate global rows. `key` immutable after create (enforced in the serializer).
- **`RequirementTemplate`** — `organization`, `name`, `is_default`, `created_by`, timestamps.
  `unique(organization, name)` + partial unique on `organization WHERE is_default` (one default per org).
- **`RequirementTemplateItem`** — `template`, `file_type`, `is_required`, `months_required` (nullable
  override), `order`. `unique(template, file_type)`.
- **`CreditCaseRequirement`** — `credit_case` (`related_name='requirements'`), `file_type`,
  `is_required`, **`source`** (`'template' | 'manual'`), **`source_template`** (nullable FK),
  `months_required`, `created_by`, `created_at`, `synced_at`. `unique(credit_case, file_type)`.

`is_required` comes from the existing note at the bottom of `docs/versions/v2.md` — *"let user just
select what's strictly required vs optional"* — and from the v1 checklist item's own wording (*"strict
requirements to consider solicitud as complete"*). A `False` item shows in the checklist but does not
block completeness. It is one boolean now versus a migration across three tables later, so it is
included; say the word if you'd rather every requirement be mandatory for v1.

`source` is load-bearing: re-sync only ever touches `source='template'` rows, so the per-case extras a
user added for a specific customer are never collateral damage.

Every model and field gets a beginner-readable docstring/`help_text` per CLAUDE.md.

## 3. Migrations — `backend/storage/migrations/` (latest is `0007`)

- **`0008_file_type_and_requirements.py`** — the four `CreateModel`s + constraints/indexes, and the
  `AlterField` dropping `choices` from `uploaddocument.file_type_name`.
- **`0009_seed_file_types_and_backfill_requirements.py`** — data migration, reversible:
  1. Upsert global `FileType` rows from `FILE_TYPE_CATALOG` (shares the same helper as the management
     command below, so fresh DBs and test DBs are seeded identically).
  2. Per existing `Organization`: a `RequirementTemplate` named "Default" (`is_default=True`) with items
     for the five current `DEFAULT_SUGGESTION_KEYS`.
  3. Per existing `CreditCase`: `CreditCaseRequirement` rows for those five,
     `source='template'`, `source_template=<that org's default>`.

`pytest.ini` uses `--reuse-db`, so the first run after this needs `pytest --create-db`.

## 4. Catalog sync command

`backend/core/management/commands/sync_file_types.py` (plus the two missing `__init__.py` files —
no `management/` dir exists in this repo yet). Idempotent upsert keyed on `key`; updates labels,
category, months; **never deletes and never deactivates**. This is how new file types reach existing
environments after the catalog module is edited.

## 5. Serializers, viewsets, routes

New basenames in `core/constants.py`: `FILE_TYPE_BASENAME`, `REQUIREMENT_TEMPLATE_BASENAME`,
`CREDIT_CASE_REQUIREMENT_BASENAME`.

- **`FileTypeViewSet`** (read-only) — must return **global OR the user's own** rows, which
  `OrganizationScopedMixin` cannot express (`core/mixins.py:41` builds a single `filter`). Override
  `get_queryset` with `Q(organization__isnull=True) | Q(organization__in=user.organizations.all())`.
- **`RequirementTemplateViewSet`** — `OrganizationScopedMixin`, `organization_lookup='organization'`,
  `perform_create` sets `organization`/`created_by` (mirrors `LabelViewSet`, `storage/views.py:119`).
  Writable nested items. Two actions:
  - `GET /requirement-templates/{id}/impact/` — per open case seeded from this template
    (`submitted_at__isnull=True`): `{credit_case_id, adds[], removes[], removes_with_uploads[]}`.
    `removes_with_uploads` is what lets the UI warn *"2 cases already have a Balance sheet uploaded for
    a requirement you're removing."*
  - `POST /requirement-templates/{id}/apply/` — body `{credit_case_ids: [...]}`. `@transaction.atomic`
    per `docs/architecture/decisions.md`. Touches only `source='template'` rows, stamps
    `synced_at`/`created_by`, **never writes `status`**, refuses submitted cases.
- **`CreditCaseRequirementViewSet`** — `organization_lookup='credit_case__customer__organization'`,
  `organization_scoped_fields={'credit_case': 'customer__organization', 'file_type': ...}`. Per-case
  add/remove; creates land as `source='manual'`.

Register all three in `backend/storage/urls.py`.

**Tenant isolation** (mandatory, CLAUDE.md): `LabelValueSerializer` (`storage/serializers.py:217`) is
the reference for the belt-and-braces pattern — scope FK querysets *and* independently re-validate
ownership in `validate()`. Apply the same to every writable FK here, especially `apply/`'s
`credit_case_ids`, which must be re-checked against the requesting user's orgs rather than trusted.

## 6. Seeding requirements on credit case creation

New service `backend/storage/services/requirements.py`:
`seed_requirements_from_template(credit_case, template)` — `@transaction.atomic`, copies items to
`source='template'` rows. Called from `CreditCaseViewSet.perform_create`
(`processing/views.py:39`) using the org's default template.

`CreditCaseSerializer` gains an optional write-only `requirement_template` so the user can pick a
non-default template at creation (the *"choose default set and/or reqs particular to that customer"*
requirement). **No default template → zero rows**, which is exactly the signal the frontend will use to
show the onboarding prompt.

## 7. Read side stays backwards compatible

`CreditCase.required_file_type_names` becomes
`{r.file_type.key for r in self.requirements.all() if r.is_required}` — so optional items never affect
completeness. A sibling `optional_file_type_names` property + read-only serializer field exposes the
rest. `missing_file_type_names` / `total_missing_files` are unchanged. The existing serializer field
(`processing/serializers.py:36`) and the frontend's `requiredFileStatuses` memo
(`frontend/src/app/credit-cases/[id]/page.tsx:103`) keep working with **no frontend change** — which is
what makes backend-only shippable on its own.

Add `prefetch_related('requirements__file_type')` to `CreditCaseViewSet.queryset` to avoid N+1.

## 8. Tests — `backend/storage/tests/`, pytest function style

Models: partial unique index actually rejects a second global row with the same key; one-default-per-org
constraint; `unique(credit_case, file_type)`.

Catalog: sync command is idempotent across two runs; adding a spec creates exactly one row; renaming a
label updates in place without touching the key.

Behavior: case creation seeds from the org default; no default → zero rows; `impact/` reports adds,
removes, and `removes_with_uploads` correctly; `apply/` preserves `source='manual'` rows, skips cases
with `submitted_at` set, and leaves `status` untouched; `required_file_type_names` reflects the rows.

Isolation: another org's template is invisible and un-appliable; `apply/` rejects foreign
`credit_case_ids`; global `FileType`s are visible to every org while org-owned ones are not.

Regression: full suite green (baseline 73 passed / 6 skipped).

## 9. Docs and logs

- **`docs/architecture/decisions.md`** — new section recording the settled-decisions table above with
  rationale (explicitly requested).
- **`docs/versions/v1.md:39`** — replace the *"no user-defined requirements"* constraint with:
  > - users define their own document requirements (per-org templates + per-case overrides), selected
  >   from the app-provided catalog of file types
  > - users cannot yet add file types outside that catalog — a custom type requires its own extraction
  >   schema (deferred)

  and drop the now-stale "conflicts with Constraints" note at line 117.
- **`docs/architecture/database.md`** — ERD entries for the four new models (required by `ai/agents/db.md`).
- **`docs/versions/v2.md`** — record the deferred **user-created file types** work as a planned v2
  feature, with enough detail to pick up cold: org-owned `FileType` rows (`organization` set, never an
  edit to a global row); a writable `FileTypeViewSet` with slugified, immutable keys; an
  `extraction_schema` JSONField holding JSON Schema directly, since `gpt.py:229` already consumes JSON
  Schema and only uses pydantic to generate it (no runtime `create_model()` needed); the classifier
  `Literal` built per request from global + that org's keys; and graceful degradation of the
  friendly-file-name chain (`friendly_file_name` stays null for unmatched types).

  Two cleanups while in that file: its heading reads `# v1` (copy/paste slip), and its trailing
  free-text note about user-defined requirements is now **half implemented by this build** — the
  "select from a given list of available requirements" and "set a default, add/remove per customer"
  parts land in v1. Trim it to only the genuinely deferred remainder. The file types it lists (Acta
  Constitutiva, Poder Notarial de Apoderados, ID Oficial) are candidates for the catalog list coming
  later.
- Feature logs per `ai/execution_context/feature_context.md`:
  `logs/{prompts,plans,implementations}/document_requirements-<yyyy-mm-dd-hh-mm-ss>.md`.

## Out of scope

- **All frontend work** — onboarding prompt, template editor, impact warning modal, and swapping the
  hardcoded `FILE_TYPE_NAME_LABELS` map for API-served labels. Confirmed backend-only.
- **User-created file types** — deferred and written up in `docs/versions/v2.md` (see Docs above). The
  `organization` column on `FileType` and the per-request GPT schema exist so this lands as a later
  addition, not a rewrite.
- **The friendly-file-name `if/elif` chain** (`db_object_handling.py:185-215`) stays as is.
- Converting `file_type_name` to a real FK — deliberate; it would touch every string comparison in the
  extraction pipeline for no gain right now.
- Re-syncing submitted cases, and any status recomputation.

## Verification

1. `docker compose exec backend python manage.py makemigrations --check --dry-run` → clean (and the
   phantom `file_type_name` `AlterField` should now be gone for good).
2. `docker compose exec backend python manage.py migrate` applies; `migrate storage 0007` reverses
   cleanly, then forward again.
3. `docker compose exec backend python manage.py sync_file_types` twice → second run reports zero
   changes.
4. `docker compose exec backend pytest --create-db -q` → new tests pass, 73/6 baseline holds.
5. `./scripts/sync-api-schema.sh` → `schema.yaml` validates, `api.generated.ts` regenerates;
   `cd frontend && npx tsc --noEmit` clean.
6. Manual, authenticated, against the running stack: create a template with 3 types; create a credit
   case and confirm its `required_file_type_names` matches; add one manual requirement to that case;
   edit the template (add one, remove one); `GET impact/` shows that case with the right adds/removes;
   `POST apply/`; confirm the manual requirement survived, `status` is unchanged, and a submitted case
   is untouched; confirm another org's template returns 404.
