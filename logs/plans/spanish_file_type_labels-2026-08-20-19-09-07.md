# Plan — Show file type names in Spanish

Date: 2026-08-20

## Read of the request

Every catalog entry in `backend/core/file_type_catalog.py` ALREADY carries a `label_es`
next to its `label_en` (e.g. `poder_notarial` is "Poder notarial de apoderados",
`pagare` is "Pagaré"). So this is not a translation job — it is a display job. The
frontend simply reads `label_en` everywhere it prints a document name.

The user explicitly asked to KEEP the English labels ("leave the english labels for
later"). So nothing is renamed or dropped; only the field the UI reads changes.

## Approach

Introduce ONE frontend helper, `fileTypeDisplayLabel()`, and route every place that
prints a document name through it. It prefers `label_es` and falls back to `label_en`.

Why one helper rather than swapping `.label_en` → `.label_es` at each of the seven call
sites: when the app grows a real language toggle, the choice of which label to show has
to live in exactly one place. Seven scattered `.label_es` reads would each have to be
found and rewritten; one helper becomes one `if`.

## Steps

1. Backend — expose `label_es` wherever `label_en` is already exposed, additively:
   - `RequirementTemplateItemSerializer` and `CreditCaseRequirementSerializer`
   - the `impact/` payload built by `RequirementTemplateViewSet._serialize_file_types`
2. Backend — translate the group headings in `FILE_TYPE_GROUPS` (the picker prints these
   directly above the Spanish document names; leaving "Tax / SAT" there would be a
   language mix in one list).
3. Backend — order `FileType` by `label_es` instead of `label_en`, and
   `CreditCaseRequirement` by `file_type__label_es`. Alphabetical-by-English is visibly
   random once the UI reads Spanish. State-only migration (AlterModelOptions), no DDL.
4. Frontend — add `fileTypeDisplayLabel()` to `lib/fileTypes.ts`; use it in
   `FileTypePicker`, `FileTypeChooser`, `FileTypeSelect`, `ImpactWarning`, and inside
   `fileTypeLabel()`.
5. Frontend — search (`searchFileTypes`) keeps matching BOTH labels and the key, so a
   user who types "power of attorney" still finds the poder notarial.
6. Regenerate `schema.yaml` + `api.generated.ts`; run backend and frontend suites.

## Out of scope

General UI copy (buttons, headings, table columns, error text) stays English. The
request was about the document names; translating the whole app is a separate,
much larger piece of work.
