# Implementation — live classification progress on uploads — 2026-08-17 18:29:29

Backend `199 passed, 6 skipped`; frontend `277 passed` across 23 files; `npx tsc --noEmit`
and `npm run lint` clean.

---

## The decision behind it

`file_type_name IS NULL` cannot tell "queued two seconds ago" from "the worker died last
week", and a spinner on the second case never stops. Asking Celery does not help — a result
backend IS configured, but Celery answers `PENDING` for a task id it has never heard of, so
both cases come back identical, results expire after 24h, and it would cost a migration plus
a Redis round trip per row.

So the status is derived from time, **on the backend**, because the backend owns the timeout
knob and because a client-side countdown would restart on every page mount (a document
abandoned days ago would look freshly queued each time it was opened).

---

## Backend

**`backend/app/settings.py`** — new `DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS`
(env-overridable, default 300), placed beside `OPENAI_REQUEST_TIMEOUT_SECONDS`. Comment
records why it is not the true worst case (3 OpenAI calls × up to 120s × 4 attempts is over
20 minutes): past five minutes a dead worker is likelier than a slow one, and a usable file
type control beats a spinner that never stops.

**`backend/storage/services/classification_state.py`** (new) — `classification_status(doc,
now=None)` returning `CLASSIFIED` / `PROCESSING` / `UNCLASSIFIED`. Pure: no queue, no
network, `now` injectable. Module docstring records the rejected Celery-AsyncResult option.
`unknown` counts as CLASSIFIED — it is the classifier saying "I could not tell", an answer
rather than the absence of one. An unsaved row (no `uploaded_at`) reports PROCESSING instead
of crashing on the arithmetic.

**`backend/storage/serializers.py`** — read-only `classification_status`
`SerializerMethodField` on `UploadDocumentSerializer`, added to `Meta.fields`.

**`backend/schema.yaml` + `frontend/src/lib/api.generated.ts`** — regenerated via
`./scripts/sync-api-schema.sh`.

### Backend tests

- `backend/storage/tests/services/test_classification_state.py` (new, 9 tests) — classified
  wins at any age · `unknown` counts as classified · fresh upload is processing · still
  processing one second inside the timeout · unclassified exactly at it · unclassified a
  week later · the timeout is honoured when overridden · an unsaved row is processing.
- `backend/storage/tests/views_serializers/test_file_type_correction.py` (+3) — the API
  serves `processing` for a fresh unclassified upload, `classified` for a typed one, and a
  hand-set correction flips the document to `classified` in the PATCH response.

---

## Frontend

**`frontend/src/lib/classification.ts`** (new, pure) — `ClassificationStatus` type,
`classificationStatus(doc)` (reads the backend field, falls back to deriving from
`file_type_name` for a payload built before the field existed), `isClassifying`,
`anyClassifying`, `CLASSIFICATION_POLL_MS = 4000`.

**`frontend/src/lib/useClassificationPolling.ts`** (new hook) — re-reads every 4s while at
least one document on screen is `processing`, and stops the moment none are, so an idle page
issues no requests. Two details that matter:
- the caller's refresh function is held in a ref, so a page passing a plain unmemoized
  function does not tear down and rebuild the timer on every render (which would mean a page
  re-rendering faster than the interval never polls at all — pinned by a test);
- a tick counter forces a re-render each cycle, so a row stops spinning when the backend
  changes its verdict even if nothing else about the document changed.

Polling rather than WebSockets/SSE: the wait is seconds on a page the user is already
watching, and a push channel means new infrastructure (a socket layer in Django, a second
protocol to scope per organization) for very little.

**`frontend/src/components/DocumentList.tsx`** — a `processing` row renders a
non-interactive "Classifying…" chip with the same `Spinner` the `pending_ai_verdict` status
uses. The type control is deliberately withheld while processing: there is nothing to
correct yet, and the worker would overwrite whatever was set. `role="status"` so the state
is announced, not just drawn.

**`frontend/src/components/FileTypeSelect.tsx`** — new optional `emptyLabel` prop.
`DocumentList` passes "Not classified" for a document the backend has given up on, because
the default wording ("Pending classification") would be a never-ending spinner in words.

**`credit-cases/[id]` and `customers/[id]`** — the hook is wired to the reload functions
each page already has, so a finished classification also brings across everything else it
moves: the case's `requirements_complete` and `status`, and the RFC/address a CSF fills in
on the customer. Three docstrings that still claimed the backend classifies before
responding were corrected — they described the pre-Celery behaviour.

### Frontend tests

- `src/lib/classification.test.ts` (new, 7 tests) — reads the backend's value, trusts it
  over the file type, falls back when absent, ignores an unrecognised value, and
  `anyClassifying` over lists/null.
- `src/lib/useClassificationPolling.test.ts` (new, 8 tests) — polls on an interval while
  processing · never polls when all are done · stops as soon as the last finishes · starts
  when an upload appears · holds off while disabled · does not restart on callback identity
  change · stops on unmount · honours a custom interval.
- `src/components/DocumentList.test.tsx` (+4) — spinner instead of a type · no type control
  while classifying · spinner swaps for the type once polling brings the answer · "Not
  classified" plus a usable control once the backend gives up.

---

## Documentation

`docs/architecture/decisions.md`:
- new Backend entry "The backend decides whether a document is still being classified"
  (the rejected Celery option, the three statuses, why the backend owns the verdict, why
  polling over push, and what was not built — no sweep for stuck documents);
- the Celery entry's "Polling / a 'Classifying…' state was deliberately deferred" line
  updated to point at it.
