# Implementation — Show file type names in Spanish

Date: 2026-08-20

## What this actually was

Not a translation job. Every entry in `backend/core/file_type_catalog.py` already carried
a `label_es` next to its `label_en` — `poder_notarial` was already "Poder notarial de
apoderados", `pagare` was already "Pagaré". The frontend was simply reading the wrong
field. Nothing was renamed and no English label was removed; the English name is still
stored, still served, and kept for a future language toggle exactly as the user asked.

## Backend

**`core/file_type_catalog.py`** — `FILE_TYPE_GROUPS` headings translated
(Financieros / Fiscales / SAT / Legales / corporativos / Proceso de crédito /
Garantías / aval / Operativos / Otros). These print directly above the Spanish document
names, so an English heading there would be a language mix inside one list. Comment added
explaining there is no second English heading anywhere, so this tuple is the one place a
language toggle would have to grow one.

**`storage/serializers.py`** — `label_es` added alongside the existing `label_en` on
`RequirementTemplateItemSerializer` and `CreditCaseRequirementSerializer`. Additive: no
field removed, no field renamed. Two docstring examples updated to the Spanish headings.

**`storage/views.py`** — `RequirementTemplateViewSet._serialize_file_types` (the `impact/`
payload) now sends both labels.

**`storage/models.py` + migration `0012_order_file_types_by_spanish_label.py`** —
`FileType.Meta.ordering` `['label_en'] → ['label_es']`, and
`CreditCaseRequirement.Meta.ordering` `['file_type__label_en'] → ['file_type__label_es']`.
A list sorted by the English name looks shuffled to someone reading the Spanish one.
`AlterModelOptions` only: no columns change and no SQL runs.

## Frontend

**`lib/fileTypes.ts`** — new `fileTypeDisplayLabel(fileType)`, the single place that
decides which name is printed. Takes a structural `{ label_en, label_es? }` rather than a
full `FileType`, because requirement rows, template items and the impact payload all carry
the labels without being one. Falls back to English when there is no Spanish name.

`fileTypeLabel(key, fileTypes)` now routes through it, and gained an explicit
`unknown → "Desconocido"` case: `unknown` is never served by `/file-types/`, so without it
the fallback printed the title-cased key — an English word sitting in a Spanish list.

**`TemplateImpactEntry`** — its four arrays now share one `ImpactFileType` type carrying
both labels, instead of repeating an inline `label_en`-only shape four times.

**Call sites routed through the helper:** `FileTypePicker` (button text; the English name
moved to the `title` tooltip, where it used to hold the Spanish one), `FileTypeChooser`
(selected-documents list), `FileTypeSelect` (dropdown options and the `unknown` entry),
`ImpactWarning` (all three add/remove/warn lists).

**`FileTypeSelect` search widened.** Its options now carry a `search` field
(`label_es + label_en + key`) separate from the visible `label`, matching what
`searchFileTypes` already did for the picker. Without this, switching the display to
Spanish would have quietly made every document unfindable by its English name in the
misclassification corrector.

**`lib/fileTypeGroups.ts`** — the fallback heading for an ungrouped type is now "Otros".

## Docs

- `docs/architecture/decisions.md` — new entry "Document names are shown in Spanish, and
  one function decides that"; the existing grouping entry's heading examples updated.
- `docs/architecture/file_type_catalog_reference.md` — notes that its English section
  headings are the group keys and that the app displays their Spanish equivalents.
- `docs/versions/v1.md` — the file-type bullet records the Spanish display and points at
  `fileTypeDisplayLabel()`.

## Tests

**Backend** (`storage/tests/views_serializers/test_requirements.py`):
- `test_file_types_endpoint_carries_grouping_for_the_picker` — heading assertion updated
  to Spanish.
- NEW `test_file_types_endpoint_carries_both_labels_ordered_by_spanish` — both labels on
  every row, `pagare` really is "Pagaré"/"Promissory note", the list arrives sorted by the
  Spanish name, and that order is genuinely different from the English one.
- NEW `test_credit_case_requirement_rows_carry_the_spanish_label`.
- NEW `alphabetical_key()` helper: Postgres does the sorting and its default collation
  ignores case, accents and spaces, which Python's `sorted` does not — "Declaración anual"
  vs "Declaraciones provisionales" sort the opposite way under the two rules.

**Frontend:**
- NEW `lib/fileTypes.test.ts` (11 assertions) — the helper itself: prints Spanish, falls
  back to English on null/empty/whitespace, works on a bare label pair, names `unknown` in
  Spanish, still title-cases an unrecognised key.
- `components/FileTypePicker.test.tsx` — assertions updated to the Spanish names; new
  tests that an English search still finds a Spanish-labelled document, that the English
  name survives as the tooltip, and that a type with no Spanish name still renders.
- `components/DocumentList.test.tsx` — `unknown` now reads "Desconocido"; the search test
  deliberately still types "unknown" to prove English search works.
- `lib/fileTypeGroups.test.ts` — ungrouped heading is "Otros".

## Verification

- `pytest --create-db` → **222 passed, 6 skipped** (up from 220; `--create-db` replays
  every migration, per the lesson from the 0011 crash).
- `npm test` → **340 passed, 28 files** (up from 333).
- `npx tsc --noEmit` and `npm run lint` → clean.
- `manage.py migrate` applied `0012`; `manage.py sync_file_types` reports 22 unchanged.
- Queried the live table: rows come back Acta constitutiva, Actas de asamblea, Alta
  patronal IMSS, Balance general, CFDI de ingresos… — Spanish, alphabetical by Spanish.

## Explicitly out of scope

General UI copy — buttons, table headers, status labels, error messages — is still
English. The request was about document names. Translating the whole app needs its own
decision (a real i18n layer vs. hardcoded Spanish) and is much larger.
