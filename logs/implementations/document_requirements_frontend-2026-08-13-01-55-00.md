# Implementation log — document requirements, frontend

Feature: `document_requirements` (frontend half; backend shipped 2026-08-11)
Date: 2026-08-13

## Result

`127 passed, 6 skipped` backend (7 new). `117 passed` frontend (9 new). `makemigrations --check`
clean (no model changes). `tsc --noEmit` and `eslint` clean.

## Flow implemented

The user specified requirement selection as a **third step of the create-case wizard**, not on the
case detail page:

- **Org has no default template** → step 3 prompts them to choose the required files for every new
  credit case. That selection becomes the org's default template, and the case is then seeded FROM
  that template so it stays linked to it.
- **Org has a default template** → step 3 shows a separated **Default** button (hover lists its
  contents) alongside the full catalog as boxed toggles. Mutually exclusive: Default greys out the
  individual documents, picking any document greys out Default. Green Submit unlocks once either is
  chosen.

## 1. Backend — one endpoint, no model changes

- `backend/processing/views.py` — `POST /api/v1/credit-cases/{id}/set-requirements/` action on
  `CreditCaseViewSet`. Needed because the case is created *before* the chooser appears, so the client
  must reconcile an already-seeded case; doing that browser-side would be N deletes + M posts with no
  transaction around them.
  - `{"requirement_template": id}` → `reseed_requirements_from_template()`, rows land
    `source='template'` so the case stays eligible for that template's future re-syncs.
  - `{"file_type_ids": [...]}` → `replace_requirements_with_file_types()`, rows land
    `source='manual'` so a later re-sync deliberately skips the case (it opted out of the default).
- `backend/storage/services/requirements.py` — added those two helpers, both `@transaction.atomic`.
- `backend/storage/serializers.py` — `SetCreditCaseRequirementsSerializer`: a plain `Serializer`
  (action input, not a row), narrows both fields to global-or-own in `__init__`, and rejects both
  modes at once or neither.
- 7 tests in `backend/storage/tests/views_serializers/test_requirements.py`.

## 2. Frontend

- **`frontend/src/lib/fileTypes.ts`** (new) — the whole data layer: `listFileTypes()`,
  `getDefaultTemplate()`, `createDefaultTemplate()`, `updateTemplateItems()`,
  `setCreditCaseRequirements()`, `getTemplateImpact()`, `applyTemplateToCases()`,
  `templateFileTypeIds()`, `fileTypeLabel()`.
- **`frontend/src/components/FileTypeChooser.tsx`** (new) — shared by the wizard step and the
  Requirements page. Ghost-filled toggles that turn blue when selected; separated Default button with
  hover tooltip; two-way mutual exclusion; green Submit disabled until a selection exists. Disabled
  states are real (`disabled` + `aria-disabled`), toggles carry `aria-pressed`.
  9 colocated tests in `FileTypeChooser.test.tsx`.
- **`frontend/src/app/credit-cases/new/page.tsx`** — `Phase` gained `"requirements"`.
  `handleCreateCreditCase` now keeps the created case, loads the catalog + default template, and
  advances instead of navigating to the list. `handleSubmitRequirements` handles both branches, then
  routes to the new case. "Skip for now" escape hatch — the case already exists, so abandoning the
  step still leaves valid data.
- **`frontend/src/app/requirements/page.tsx`** (new) + `Requirements` nav link in `AppShell.tsx` —
  edit the default template; on save PATCH the items, then `GET impact/`; if any open cases would
  change, an `ImpactWarning` dialog lists per-case adds/removes and, in red,
  `removes_with_uploads` (documents the customer already sent that would stop counting). Two actions:
  **Update these cases** → `apply/`, or **Keep them as they are** → close, no request.
- **`frontend/src/app/credit-cases/[id]/page.tsx`** — labels now come from the API; optional
  requirements render as a separate dashed "Optional" group; empty state links to `/requirements`.
- **`frontend/src/lib/constants.ts`** — **deleted `FILE_TYPE_NAME_LABELS`**. It was a second source of
  truth for exactly what the backend catalog unified; any newly added document type would have
  rendered as a raw key. Replaced with a comment explaining why nothing should be re-added there.
- `frontend/src/lib/types.ts` — aliases for `FileType`, `RequirementTemplate`,
  `RequirementTemplateItem`, `CreditCaseRequirement`.

## 3. Docs

- `docs/versions/v1-missing.md` (new) — the five verified v1 gaps unrelated to requirements: token
  blacklist route never wired, no per-file update/delete UI, no auto-create of a credit case on
  customer creation, `DocumentDataExtract` dead code, and `is_required=False` unreachable from the UI.

## Verified end to end against the running stack

1. New org's first case seeds zero requirements → the onboarding signal fires.
2. First-time setup creates the template and the case's rows are template-sourced.
3. Second case auto-seeds from the default; choosing Default keeps it matching.
4. Deviating with individual file ids produces manual rows.
5. Editing the template reports impact on 2 cases and **correctly excludes the deviated case**;
   flags the already-uploaded document being removed.
6. Apply changes the cases, leaves `status` untouched; re-running impact returns empty (idempotent).

## Notes

- Next.js 16's async Request APIs breaking change affects server components only; every page here is
  `"use client"` using `useParams`/`useRouter`, so new work follows the existing pattern unaffected.
- `is_required=False` still has no UI path — the chooser is binary. Recorded in `v1-missing.md`
  rather than inventing UI the user did not ask for.

---

## Follow-up fixes (same day, after user review)

### 1. First-time setup no longer creates the default silently

Previously a first-time organization's selection was turned into their default template
automatically. Now they are asked, and the answer changes what happens.

- `FileTypeChooser` gained `saveAsDefaultQuestion`. When set, and once documents are picked, a
  Yes/No prompt appears and **Submit stays disabled until it is answered**.
- The question is asked **before** Submit, deliberately: the answer decides which requests fire, so
  asking afterwards would mean writing requirements and then possibly rewriting them.
  - **Yes** → `POST /requirement-templates/` then `set-requirements {requirement_template}` — rows
    are template-sourced, so the case stays linked and future template edits can be offered to it.
  - **No** → `set-requirements {file_type_ids}` only. No template is created; rows are manual.
- After submitting, the step shows an **outcome panel** stating exactly what happened
  (saved as default / saved for this case only / using the org default) plus a "Go to credit case"
  button, instead of navigating away silently.

### 2. Default vs documents now switches instead of blocking

The old behaviour disabled the inactive group, so a user had to unselect Default before they could
touch a document — two clicks for one intention.

- Neither group is ever `disabled` now. Clicking anything works on the first click and simply moves
  the active choice.
- State is `activeGroup` (`"default" | "fileTypes"`) held **separately** from `selectedIds`, so
  switching to Default does not discard picked documents — they stay visibly selected (blue) but
  dimmed, and switching back restores them exactly.
- The dim (`opacity-50`) is what communicates "this is not what will be submitted", replacing the
  disabled state.

Tests updated accordingly: the three old "disables the other group" tests were replaced by
single-click switching in both directions, a test that neither group is ever disabled, and two
covering the save-as-default question. Chooser suite is 11 tests; frontend total 119 passing.

---

## Per-case requirement editing during a case's active life (2026-08-14)

Closes the last part of the original ask: *"let user choose default set and/or any other reqs
particular to that customer, even during the credit case's active life."*

Three decisions confirmed with the user first, all three implemented:

### 1. Sticky removals — `CreditCaseRequirement.is_excluded` (migration `storage/0010`)

Removing a document that came from the org's template no longer deletes the row; it flags it
`is_excluded=True`. The row is kept precisely so the removal STICKS: `diff_template_against_case`
counts any existing row (excluded included) in `present_file_type_ids`, so a later template re-sync
sees the file type is accounted for and cannot silently put it back. Manual rows have nothing that
would resurrect them, so those are deleted outright.

- `required_file_type_names` / `optional_file_type_names` filter out excluded rows.
- `CreditCaseRequirementViewSet.queryset` filters them out too — an excluded row is bookkeeping, not
  a requirement, and must not appear in the API list.
- Re-adding an excluded document turns the row back on (`perform_create` finds it and clears the
  flag) rather than colliding with `unique(credit_case, file_type)`.

### 2. Status reverts on manual edits only — `handle_manual_requirement_change()`

Adding a requirement to a case waiting on a verdict pulls it back to `missing_documents`; removing
the last outstanding one advances it. Template re-syncs keep the existing non-regressing behaviour
(`apply_template_to_case` still never writes status), because those are bulk indirect changes that
must not reshuffle a reviewer's queue. Only `PENDING_AI_VERDICT` / `PENDING_FINAL_VERDICT` are
revertible — a buró rejection or a decided case is finished.

### 3. Edits blocked once `submitted_at` is set

`_reject_if_submitted()` guards create/update/destroy on `CreditCaseRequirementViewSet`, and the
same check was added to `POST /credit-cases/{id}/set-requirements/`. Same line as everything else in
this feature: once submitted, the requirement list is the reviewer's evidence.

### Bug found while testing

`POST /credit-case-requirements/` was silently creating **optional** requirements. DRF's
`BooleanField` treats a field simply ABSENT from form-encoded input as `False`, so a client adding a
document without mentioning `is_required` got one that never blocks completion. Fixed by declaring
`is_required = serializers.BooleanField(default=True)` explicitly. The pre-existing
`test_manual_requirement_can_be_added_to_own_credit_case` passed throughout without catching it.

Also had to clear the serializer's auto-generated `UniqueTogetherValidator` (`validators = []`), which
rejected re-adding an excluded document before the view's un-exclude logic could run.

### Frontend

`Edit` toggle in the Required documents panel (hidden once submitted), a `Remove` button per row, and
an add row listing catalog documents the case doesn't already have. Both actions re-read the case so
the completion badge and status reflect the revert/advance immediately.

### Verified end to end

```
1. seeded:                       [balance_sheet, bank_statement]
2. after removing balance_sheet: [bank_statement]
3. after adding income_statement:[bank_statement, income_statement]  is_required: True
4. after template re-sync:       [bank_statement, cashflow_statement, income_statement]
   balance_sheet stayed removed: True | manual income_statement survived: True
5. all uploaded ->               pending_final_verdict
6. manual add on waiting case -> missing_documents (reverted)
7. edit after submitted ->       400
```

Backend 148 passed / 6 skipped (10 new). Frontend 119 passed, tsc + eslint clean.
