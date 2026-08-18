# Plan — live classification progress on uploaded documents — 2026-08-17 18:29:29

## The problem

Classification moved into a Celery worker (`backend/storage/tasks.py`), so
`POST /upload-documents/` now returns 201 with `file_type_name = null` and the real answer
lands 10-30 seconds later. The frontend never learned about that change: it renders the
null as a static "Pending classification" badge and leaves it there until the user reloads
the page by hand. So the app looks broken twice — nothing indicates work is happening, and
the answer never arrives on its own.

Two things are needed: a spinner while the worker is genuinely working (the same treatment
`pending_ai_verdict` already gets in `StatusDot`), and the type appearing on its own.

## The question this hinges on: "is it still running?"

`file_type_name IS NULL` alone cannot answer that. It is equally true for a document queued
two seconds ago and one whose worker died last week — and a spinner that never stops is
worse than no spinner, because it lies.

**Rejected: asking Celery.** A result backend IS configured
(`CELERY_RESULT_BACKEND`, Redis db 1), so the task id could be stored on the row and
`AsyncResult(task_id).status` read back. Not worth it here:
  - Celery reports `PENDING` for an id it has never heard of, so "queued" and "gone
    forever" are the same answer — the exact ambiguity being solved.
  - Results expire (24h by default), after which every older document reports `PENDING`
    again.
  - It costs a migration, plus one Redis round trip per row in a list response.

**Chosen: derive it from time.** A document is *processing* when it has no
`file_type_name` yet AND was uploaded within the classification timeout; past that, the job
is far likelier dead than slow, so it is reported as *unclassified* and the user can label
it by hand. No new state to keep in sync, and it stays correct across page loads, restarts
and navigation — unlike a client-side countdown that would restart on every mount.

**Where the rule lives: the backend.** The frontend must not invent how long GPT takes.
The backend owns the timeout knob, so it also owns the verdict, and the frontend just
renders what it is told.

## Backend

1. **`backend/app/settings.py`** — new `DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS`
   (env-overridable, default 300). Comment explains the choice: the hard ceiling with
   retries is far higher, but past five minutes a dead worker is the likelier explanation,
   and the user is better served by a control they can use than a spinner that never stops.

2. **`backend/storage/services/classification_state.py`** (new) — one function,
   `classification_status(doc, now=None)`, returning `'classified' | 'processing' |
   'unclassified'`. Pure and unit-testable; no queue, no network.

3. **`backend/storage/serializers.py`** — read-only `classification_status`
   `SerializerMethodField` on `UploadDocumentSerializer`, so every document the frontend
   receives already carries the verdict.

4. **Tests** — `backend/storage/tests/services/test_classification_state.py`: classified
   wins regardless of age; a fresh unclassified upload is processing; one past the timeout
   is unclassified; the boundary; `'unknown'` counts as classified (it is the classifier's
   own answer, not an absence of one). Plus an API test that the field is serialized.

5. `./scripts/sync-api-schema.sh` to regenerate `schema.yaml` / `api.generated.ts`.

## Frontend

6. **`frontend/src/lib/classification.ts`** (new, pure) — `classificationStatus(doc)`
   reading the new field, with a fallback derivation for payloads that predate it;
   `isClassifying(doc)`; `anyClassifying(docs)`; `CLASSIFICATION_POLL_MS = 4000`.

7. **`frontend/src/lib/useClassificationPolling.ts`** (new hook) — re-fetches on an
   interval while at least one document is classifying, and stops the moment none are.
   The caller's refresh function is held in a ref so a page can pass a plain (unmemoized)
   function without restarting the timer on every render. The interval is created in an
   effect and cleared on unmount; nothing calls `setState` in an effect body
   (`react-hooks/set-state-in-effect`).

8. **`frontend/src/components/DocumentList.tsx`** — while a row is classifying, its type
   control is replaced by a non-interactive "Classifying…" chip carrying the same
   `Spinner` used for `pending_ai_verdict`. There is nothing to correct yet, and the
   worker would overwrite a hand-set value anyway. Once the type arrives (or the wait is
   given up on) the normal `FileTypeSelect` is back.

9. **`credit-cases/[id]` and `customers/[id]`** — wire the hook to the reload functions
   they already have (`reloadCaseAndUploads` / `reloadCustomerDocuments`), so a finished
   classification also brings across everything else it can move: the case's
   `requirements_complete` and status, and the RFC/address a CSF fills in on the customer.

10. **Tests** — `classification.test.ts` (predicates + fallback), 
    `useClassificationPolling.test.ts` (polls while pending, stops when classified, stops
    on unmount, no polling when nothing is pending), and `DocumentList.test.tsx` (spinner
    + "Classifying…" while processing, normal control otherwise).

## Verification

`docker compose exec backend pytest`, then `npm test`, `npx tsc --noEmit`, `npm run lint`.
