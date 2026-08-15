# Implementation log — user-defined document requirements

Feature: `document_requirements`
Date: 2026-08-11
Scope: backend only (confirmed with user). No frontend changes.

## Result

`120 passed, 6 skipped` (was `90 passed, 6 skipped` before this feature — 30 new tests, zero
regressions). `makemigrations --check` clean, migrations reverse cleanly, frontend `tsc --noEmit`
clean after schema regeneration.

## 1. Single source of truth for file types

**NEW `backend/core/file_type_catalog.py`** — `FileTypeSpec` frozen dataclass + `FILE_TYPE_CATALOG`
ordered tuple, holding key / label_en / label_es / category / pydantic_model / months_required /
is_default_suggestion / is_requirable. Derived lookups: `SPEC_BY_KEY`, `FILE_TYPE_KEYS`,
`REQUIRABLE_KEYS`, `DEFAULT_SUGGESTION_KEYS`, `PYDANTIC_BY_KEY`, `get_spec()`,
`months_required_by_category()`, `max_months_back()`.

Adding a file type is now ONE edit to that tuple + `manage.py sync_file_types`.

**REMOVED from `backend/core/constants.py`**: `CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED`,
`UPLOAD_DOCUMENT_FILE_TYPE_NAMES`, `LOAN_FILE_MONTHS_REQUIRED_FINANCIALS`,
`LOAN_FILE_MONTHS_REQUIRED_LEGAL`, `MAX_FILE_MONTHS_BACK_FINANCIALS`, `MAX_FILE_MONTHS_BACK_LEGAL`,
`FILE_TYPE_NAME_MAPPING_PYDANTIC` (and the `import *` that existed only to build it).

**ADDED to `constants.py`**: `FILE_TYPE_BASENAME`, `REQUIREMENT_TEMPLATE_BASENAME`,
`REQUIREMENT_TEMPLATE_ITEM_BASENAME`, `CREDIT_CASE_REQUIREMENT_BASENAME`.

Call sites repointed:
- `backend/processing/services/credit_case.py` — module-level month/recency dicts now derived from the
  catalog by category.
- `backend/processing/models.py` — `AccountApplication.required_file_type_names` and both
  `all_files_required_dates_complete` use `DEFAULT_SUGGESTION_KEYS`.
- `backend/integrations/openai/services/gpt.py` — `PYDANTIC_BY_KEY` replaces the old mapping.
- `backend/storage/services/db_object_handling.py`, `backend/core/tests/constants_global.py`,
  `backend/core/tests/obj_instances_global.py`,
  `backend/processing/tests/models/test_account_application.py` — stale imports removed/updated.

**`UploadDocument.file_type_name` lost its `choices=`** and `FileTypeName` was deleted from
`backend/storage/choices_for_models.py`. Side effect: the phantom `AlterField` that `makemigrations`
proposed on nearly every run is gone permanently — it was caused by the old Python `set`'s
per-process iteration order feeding the enum.

**Classifier schema moved to call time.** `file_type_models.py` replaces the static
`FileTypeNamePydantic(Literal[*UPLOAD_DOCUMENT_FILE_TYPE_NAMES])` with
`build_file_type_name_pydantic(keys)`; `gpt.py` drops the import-time `FILE_TYPE_NAME_SCHEMA` for
`GPTService.get_file_type_name_json_schema()`. Verified the generated JSON Schema is shape-identical
to what the static Literal produced.

## 2. Models — `backend/storage/models.py`

- `FileType` — catalog mirror. `organization=NULL` means app-provided/global. Constraints:
  `unique(organization, key)` **plus** a partial unique index on `key WHERE organization IS NULL`
  (Postgres treats NULLs as distinct, so the composite constraint alone does not stop duplicate
  globals — covered by a test).
- `RequirementTemplate` — org-owned, named, `is_default`. `unique(organization, name)` + partial
  unique on `organization WHERE is_default`.
- `RequirementTemplateItem` — `template`, `file_type` (PROTECT), `is_required`, `months_required`,
  `order`. `unique(template, file_type)`.
- `CreditCaseRequirement` — `credit_case` (`related_name='requirements'`), `file_type` (PROTECT),
  `is_required`, `source` (`template|manual`), `source_template`, `months_required`, `created_at`,
  `synced_at`, `created_by`. `unique(credit_case, file_type)`.

All four live in `storage` because it already imports `processing` and `customers`, so no circular
import workaround was needed.

## 3. Migrations

- `storage/0008_file_type_and_requirements.py` — four CreateModels + constraints, plus the AlterField
  dropping `choices`.
- `storage/0009_seed_file_types_and_backfill_requirements.py` — reversible data migration: seeds
  global FileTypes from the catalog, creates a "Default" template per existing organization, and
  backfills `CreditCaseRequirement` rows onto every existing credit case so nothing regresses.
  Verified `migrate storage 0007` reverses and re-applies cleanly.

## 4. Catalog sync

- **NEW** `backend/core/file_type_sync.py` — `sync_global_file_types(file_type_model)`, shared by the
  migration and the command so they cannot drift. Only creates/updates; never deletes or deactivates;
  never touches `key` or organization-owned rows. Returns `(created, updated, unchanged)`.
- **NEW** `backend/core/management/commands/sync_file_types.py` (+ the two missing `__init__.py`,
  no `management/` package existed in this repo before). Verified idempotent across two runs.

## 5. API — `backend/storage/{serializers,views,urls}.py`

- `FileTypeSerializer` / `FileTypeViewSet` (read-only). `get_queryset` overrides the mixin with
  `Q(organization__isnull=True) | Q(organization__in=...)`, because `OrganizationScopedMixin` builds a
  single `filter()` that would drop every global (NULL) row.
- `RequirementTemplateSerializer` / `RequirementTemplateViewSet` — writable nested `items`
  (full-replacement semantics), duplicate-file-type validation, nested FK queryset narrowed in
  `__init__`. Two actions:
  - `GET /api/v1/requirement-templates/{id}/impact/` → per open case: `adds`, `removes`, `updates`,
    `removes_with_uploads`.
  - `POST /api/v1/requirement-templates/{id}/apply/` → body `{credit_case_ids: [...]}`, atomic.
- `CreditCaseRequirementSerializer` / `CreditCaseRequirementViewSet` — per-case add/remove, always
  written as `source='manual'`.
- Routes registered: `file-types`, `requirement-templates`, `credit-case-requirements`.

## 6. Requirement services — NEW `backend/storage/services/requirements.py`

`open_cases_for_template()` (filters `submitted_at__isnull=True` + seeded from this template),
`seed_requirements_from_template()`, `diff_template_against_case()`, `file_types_with_uploads()`,
`apply_template_to_case()`. All multi-step writes are `@transaction.atomic` per
`docs/architecture/decisions.md`.

## 7. Credit case wiring

- `CreditCaseSerializer.create()` (`processing/serializers.py`) now seeds requirements after creating
  the case, using the optional write-only `requirement_template` or falling back to the org default.
- `CreditCase.required_file_type_names` reads its rows (`is_required` only); new sibling
  `optional_file_type_names`. The existing serializer field and frontend memo keep working unchanged.
- `CreditCaseViewSet` — added `prefetch_related('requirements__file_type')` and
  `'requirement_template': 'organization'` to `organization_scoped_fields`.

## 8. Tests — 30 new

- `backend/storage/tests/models/test_requirements.py` (8) — partial unique index on global keys,
  same key allowed for global + org row, one default template per org, both `unique_together`s,
  cascade on credit case delete, required/optional split.
- `backend/storage/tests/views_serializers/test_requirements.py` (22) — catalog seeded by migration,
  `unknown` never selectable, sync idempotency, sync repairs a renamed label without moving the key,
  seeding on create, zero-requirements onboarding signal, non-default template selection, impact
  adds/removes/`removes_with_uploads`, impact ignores submitted cases, impact empty when in sync,
  apply preserves manual rows and leaves status alone, apply stamps `synced_at`/`created_by`, apply
  rejects foreign and submitted cases, template CRUD, duplicate rejection, and four tenant-isolation
  tests.

## 9. Docs / generated artifacts

- `docs/architecture/decisions.md` — new "Document requirements" section under Backend recording every
  settled decision with rationale.
- `docs/versions/v1.md` — constraint amended (was "no user-defined requirements"); checklist items
  updated to show backend done / frontend pending.
- `docs/versions/v2.md` — heading fixed (`# v1` → `# v2`); deferred user-created file types written up
  with the remaining work; the trailing free-text note trimmed to the candidate file types still to be
  added to the catalog.
- `docs/architecture/database.md` — ERD entries for all four models.
- `backend/schema.yaml` + `frontend/src/lib/api.generated.ts` regenerated via
  `./scripts/sync-api-schema.sh`.

## Notes / caught during implementation

- **A test initially passed for the wrong reason.** `test_manual_requirement_rejected_for_another_organizations_credit_case`
  returned 400 — but because `file_type` was a hyperlinked field rejecting an integer id, not because
  of the tenant check. Fixed by making `file_type` an explicit `PrimaryKeyRelatedField` (consistent
  with template items), then confirmed via a probe that the rejection now comes from the tenant layer.
  Added `test_serializer_independently_rejects_a_foreign_credit_case` to exercise the serializer's own
  `validate()` in isolation, since the viewset's queryset scoping normally catches it first.
- **Pre-existing bug left alone** (out of scope, behavior preserved exactly):
  `processing/services/credit_case.py` `build_possible_month_intervals()` uses
  `max_mths_back_financials` inside the LEGAL branch, where `max_mths_back_legal` was presumably
  intended.
