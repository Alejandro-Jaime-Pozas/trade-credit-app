# Implementation log — async document processing (Celery + Redis)

Feature: `async_document_processing`
Date: 2026-08-15
Base: commit `66083e9`

## Result

Backend `178 passed, 6 skipped` (baseline was 173/6 — 5 new tests). No migration; no model changes.
No frontend changes. Verified end to end against the running stack.

## The problem

`UploadDocumentViewSet.create` ran `handle_upload_document_created` inline: three OpenAI round trips
per document, 10–30s. With `ATOMIC_REQUESTS = True` that held a Postgres connection open *inside a
transaction* for the whole call, and the frontend uploads in parallel, so 10 users × 4 files = 40
concurrent long-lived connections against a Postgres default of 100.

Separately, failures were caught and logged with no retry, so a rate-limited document kept
`file_type_name = null` forever — satisfying no requirement and silently preventing its credit case
from reaching `pending_final_verdict`.

## 1. Infrastructure

- `docker-compose.yml` — added `redis` (redis:7-alpine, `redis-cli ping` healthcheck, `redis-data`
  volume) and `celery-worker` (same build context and volume mount as `backend`, so it is literally
  the same codebase running the worker loop; `--concurrency=4`, low on purpose because the limit is
  OpenAI rate limits, not CPU). `backend` now also depends on `redis` being healthy.
- `backend/requirements.txt` — `celery==5.6.3`, `redis==6.4.0` (versions resolved from the container
  rather than guessed).
- `Makefile` — `worker-logs` target.

## 2. Celery wiring

- `backend/app/celery.py` (new) — app reading `CELERY_`-namespaced Django settings, with
  `autodiscover_tasks()`.
- `backend/app/__init__.py` — imports the app. Looks unused, isn't: without it `@shared_task`
  functions never register, and `.delay()` silently queues jobs no worker recognises.
- `backend/app/settings.py` — Celery block, all `os.getenv` with defaults pointing at the compose
  service name so **no `.env` change was needed**. `CELERY_TASK_ACKS_LATE = True`,
  `CELERY_WORKER_PREFETCH_MULTIPLIER = 1`, json serializers, plus
  `OPENAI_REQUEST_TIMEOUT_SECONDS` (default 120).

## 3. The task and dispatch

- `backend/storage/tasks.py` (new) — `process_upload_document(upload_document_id)`. Takes an **id**,
  not an instance (a queue message is JSON, and a copy would be stale by pickup time). Exits quietly
  on `DoesNotExist`. `autoretry_for=(openai.APIError,)` with backoff + jitter, `max_retries=3`.
  Delegates to the unchanged `handle_upload_document_created`.
- `backend/storage/views.py` — the inline call and its `try/except` replaced with
  `transaction.on_commit(lambda doc_id=doc.pk: process_upload_document.delay(doc_id))`. The lambda
  binds `doc.pk` as a default argument on purpose — a bare closure over `doc` in a loop would
  capture the last document for every callback. Removed the now-unused `pretty_print` import.
- `backend/integrations/openai/services/gpt.py` — `OpenAI(timeout=...)`.

## 4. Tests

- `backend/conftest.py` (new) — autouse fixture setting `task_always_eager` +
  `task_eager_propagates`, so tests need no broker and no worker.
- Repointed 6 patches across 4 files from `storage.views.handle_upload_document_created` to
  `storage.tasks.…` — the view no longer references that name, so those patches would have silently
  stopped intercepting and let real OpenAI calls fire in tests.
- `backend/storage/tests/tasks/test_process_upload_document.py` (new, 5 tests): the task classifies;
  a missing id is skipped not retried; `openai.RateLimitError` retries; a `TypeError` does **not**;
  and the upload endpoint returns 201 with `file_type_name = null` while the work is queued and only
  runs after commit.

## 5. Docs

`docs/architecture/architecture.md` (Redis/Celery marked implemented, Beat explicitly not),
`docs/architecture/decisions.md` (new "Background document processing" entry),
`docs/versions/v1-missing.md` (the no-retry gap is closed).

## Caught during implementation

**One existing test failed for exactly the reason the plan predicted.**
`test_file_type_sent_on_create_does_not_bypass_classification` asserted `mock_handler.called`, which
became False: classification is now queued via `transaction.on_commit`, and pytest-django wraps each
test in a transaction it rolls back, so the callback never fired. Fixed by wrapping the request in
`django_capture_on_commit_callbacks(execute=True)`. Worth noting the failure mode — without that
fixture the test would have *passed* while asserting nothing had the assertion been weaker.

**Containers were torn down mid-verification** by a concurrent `make` target from another process
working on this branch; restored and re-run, no impact on results.

## Verification

Worker startup log confirms broker connection and task registration:

```
transport:   redis://redis:6379/0
concurrency: 4 (prefork)
[tasks] . storage.tasks.process_upload_document
Connected to redis://redis:6379/0
```

Request side, worker deliberately stopped so nothing consumed the job (and no OpenAI spend):

```
1. status: 201 | elapsed: 0.214s        (was 10-30s)
2. file_type_name in response: None
3. jobs queued in redis: 1
```

Consume side, using a nonexistent id so no OpenAI call was made:

```
Task storage.tasks.process_upload_document[4c0aedbb…] received
INFO tasks UploadDocument id=999999 no longer exists; skipping classification.
Task storage.tasks.process_upload_document[4c0aedbb…] succeeded in 0.015s: None
```

Not yet exercised with a real OpenAI key end to end — that costs API calls, so it is left for the
user to confirm with a genuine document upload.
