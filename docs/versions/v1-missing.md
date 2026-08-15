# v1 — still missing

Gaps found by auditing `docs/versions/v1.md` against the actual code on 2026-08-13. Each was
verified in the codebase, not taken from a checkbox — several are marked `[x]` in v1.md but are not
implemented.

Document requirements are **not** listed here; that work is done (backend + frontend). See
`docs/architecture/decisions.md` > "Document requirements".

---

## 1. Logout does not invalidate anything server-side

- `TokenBlacklistView` is **imported** at `backend/app/urls.py:30` but never added to `urlpatterns`.
- Logging out only clears tokens from the browser. The refresh token stays valid until it expires, so
  anyone holding it can still mint new access tokens.
- v1.md marks logout `[x]` in two places (Scope, Auth and Permissions) with a parenthetical admitting
  the gap.
- **Fix: one route.** Cheapest real security win outstanding.

## 2. No update/delete for individual credit case files

- The API already supports it — `UploadDocumentViewSet` is a `ModelViewSet`, so `DELETE`/`PATCH` on
  `/upload-documents/{id}/` work today. **The gap is UI only.**
- The only delete button on `/credit-cases/[id]` deletes the whole credit case.
- Related: there is no way to correct a document GPT classified wrongly, so a misfiled upload
  permanently fails to satisfy the requirement it should have.
- v1.md line 127 (`missing update/delete for credit case files`).

## 3. Credit case is not auto-created when a customer is created

- v1.md lines 70 and 116 both claim this (`[x]`) and both parentheticals admit it isn't implemented.
- Users create a customer, then create the credit case as a separate step.
- `getOrCreateCreditCaseForNewCustomer()` in `frontend/src/lib/creditCase.ts` already handles "use the
  auto-created case if one exists", so the frontend is ready for whichever way this is decided.

## 4. `DocumentDataExtract` is dead code

- The model (`backend/storage/models.py`), serializer, and viewset all exist. **Nothing anywhere
  instantiates it** — verified by search.
- Extraction results are written to `UploadDocument.extracted_data` instead.
- So the table is always empty while looking like a meaningful part of the schema, and
  `/document-data-extracts/` is a live endpoint that returns nothing.
- Decide: wire it up (it is the natural home for extraction history + `model_version` auditing), or
  delete the model and its endpoint.

## 5. Optional requirements exist in the backend but cannot be reached from the UI

- `RequirementTemplateItem.is_required` and `CreditCaseRequirement.is_required` are real, and
  `CreditCase.optional_file_type_names` is served by the API and rendered on the credit case detail
  page.
- But `FileTypeChooser` only offers selected/unselected, so **nothing can ever set `is_required=False`**.
  Every requirement created through the UI is mandatory.
- Fix would be a third state on the chooser buttons (unselected → required → optional) or a small
  toggle on each selected button.

---

## Non-blocking notes

- `docs/versions/v1.md` itself has stale entries: the DB Models list omits `LabelValue`, `FileType`,
  `RequirementTemplate`, `RequirementTemplateItem`, and `CreditCaseRequirement`; line 71 points at
  `CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED` in `backend/core/constants.py`, which no longer exists (file
  types now live in `backend/core/file_type_catalog.py`); and line 19 says users can't modify default
  file type requirements, which is no longer true.
- `processing/services/credit_case.py` `build_possible_month_intervals()` uses
  `max_mths_back_financials` inside the LEGAL branch where `max_mths_back_legal` was presumably
  intended. Pre-existing; behavior preserved deliberately during the file type catalog refactor.
