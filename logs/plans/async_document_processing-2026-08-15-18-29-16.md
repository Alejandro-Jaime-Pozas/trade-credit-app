# Plan: Move document processing off the request thread (Celery + Redis)

## Context

Uploading a document currently runs GPT classification **inline in the HTTP request**.
`UploadDocumentViewSet.create` (`backend/storage/views.py:97`) calls
`handle_upload_document_created`, which makes three sequential OpenAI round trips per document
(upload file → classify → extract). That is 10–30s of request time.

Three things turn that from slow into fragile:

1. **`ATOMIC_REQUESTS: True`** (`backend/app/settings.py:150`) wraps the whole request in one database
   transaction, so a Postgres connection is held open, *inside a transaction*, for the entire
   third-party call. The database waits on OpenAI.
2. **The frontend uploads in parallel** (`Promise.all(files.map(...))`,
   `frontend/src/app/credit-cases/[id]/page.tsx:253`), so 10 users × 4 files is 40 concurrent
   long-lived connections, against a Postgres default of 100.
3. **No timeouts anywhere** — not on the OpenAI client, not on the server. A hang holds its
   connection and transaction indefinitely.

There is also a correctness hole, not just a performance one: `views.py:99` catches classification
failures and logs them so an OpenAI outage can't roll back a good upload — but **nothing ever
retries**. A rate-limited document keeps `file_type_name = null` forever, satisfies no requirement,
and silently prevents its credit case from ever reaching `pending_final_verdict`.

Outcome: uploads return immediately, classification happens in a worker with automatic retry, and no
database transaction is ever held open across a third-party call.

`docs/architecture/architecture.md` already specifies this stack under *Infrastructure & Background
Processing* — Redis (broker), Celery (tasks), Celery Beat (scheduling). This implements the first
two. **Deliberately a solid base, not a production deployment**: `runserver` stays, gunicorn and
Railway remain future work (`docs/architecture/decisions.md` § Deployment).

## Confirmed scope

- **Backend only.** An unclassified document already renders as *"Pending classification"* —
  `fileTypeLabel()` (`frontend/src/lib/fileTypes.ts`) returns exactly that for a null
  `file_type_name` — so the UI degrades honestly with zero changes. The existing Refresh button
  picks up results. Polling can be added later without touching the backend.
- **No Celery Beat, no stuck-document sweep.** Task retries with backoff cover the realistic
  failures (429s, transient outages). Since `file_type_name` is now user-correctable, a permanently
  failed document is fixable by hand rather than invisible.

## 1. Infrastructure

**`docker-compose.yml`** — two additions:

- `redis` service: `redis:7-alpine`, with a `redis-cli ping` healthcheck matching the existing
  `postgres-db` healthcheck style, and a named volume for persistence.
- `celery-worker` service: reuses the **existing `backend` image** (`build: ./backend`), same
  `env_file` and `./backend:/backend` volume mount so code reloads work the same way in dev.
  Command `celery -A app worker --loglevel=info --concurrency=4`. Depends on `redis` (healthy) and
  `postgres-db` (healthy). Concurrency stays small on purpose — each task is three OpenAI calls, and
  the constraint is OpenAI rate limits, not CPU.

**`backend/requirements.txt`** — add `celery` and `redis`. Both are pinned like every other entry in
that file.

**`Makefile`** — add a `worker` target for tailing/running the worker alone, mirroring the existing
`cli` target's style. `make up` picks the worker up automatically via compose.

## 2. Celery wiring

**`backend/app/celery.py`** (new) — standard Django-Celery app: reads config from Django settings
under the `CELERY_` namespace, autodiscovers `tasks.py` in every installed app.

**`backend/app/__init__.py`** — import the Celery app so it is loaded whenever Django starts. This is
the piece that is easy to forget and silently breaks task discovery.

**`backend/app/settings.py`** — Celery config block, all via `os.getenv` with working defaults so
**no `.env` change is required** (defaults `redis://redis:6379/0`, matching the compose service
name):

- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `CELERY_TASK_ACKS_LATE = True` — a task is acknowledged only after it finishes, so a worker killed
  mid-classification returns the job to the queue rather than losing it.
- `CELERY_WORKER_PREFETCH_MULTIPLIER = 1` — these tasks are long and uneven; the default of 4 would
  let one worker hoard jobs while another idles.
- Serializer `json`, timezone matching `TIME_ZONE`.

## 3. The task — `backend/storage/tasks.py` (new)

```python
@shared_task(bind=True, autoretry_for=(openai.APIError,), retry_backoff=True,
             retry_jitter=True, max_retries=3)
def process_upload_document(self, upload_document_id): ...
```

- **Takes an id, never a model instance.** Objects don't serialize onto a queue, and a pickled row
  would be stale by the time a worker picks it up.
- **Exits quietly if the row is gone** — a document deleted between dispatch and execution is normal,
  not an error worth retrying.
- **Retries only `openai.APIError` and its subclasses** (rate limit, timeout, connection, 5xx). A
  `TypeError` in our own code is a bug, and retrying it three times just burns money and hides the
  traceback. Everything else fails loudly into the existing logger.
- Delegates to the existing `handle_upload_document_created`
  (`backend/storage/services/db_object_handling.py`) unchanged — this is a relocation of *when* that
  runs, not a rewrite of *what* it does. Re-running it is safe: every step overwrites its own output.

## 4. Dispatch — `backend/storage/views.py`

Replace the inline call with:

```python
transaction.on_commit(lambda: process_upload_document.delay(doc.pk))
```

**`on_commit` is the load-bearing detail.** With `ATOMIC_REQUESTS` the row is not committed until the
response is returned. A bare `.delay()` races the worker against that commit, and the worker
routinely wins — it fetches an id that does not exist yet and the document is never classified. This
is the single most common way this refactor goes wrong.

The `try/except` around the old inline call goes away with it: dispatch cannot fail on an OpenAI
outage, and any real broker failure should surface rather than be swallowed.

**`ATOMIC_REQUESTS` can stay `True`.** Earlier I suggested `non_atomic_requests` on this view; that is
no longer needed, because the request now only does a database insert. The transaction is milliseconds,
not minutes. One less thing to reason about.

## 5. Timeout — `backend/integrations/openai/services/gpt.py`

`OpenAI()` is constructed with no timeout (`gpt.py:58`). Add an explicit one from settings
(`OPENAI_REQUEST_TIMEOUT_SECONDS`, default 120). Without it a hung connection pins a worker slot
forever; with it the call raises `APITimeoutError`, which is in the retry tuple above, so it recovers
on its own.

## 6. Tests

**`backend/conftest.py`** (new) — autouse fixture forcing `task_always_eager` and
`task_eager_propagates` on the Celery app, so tests run tasks inline and deterministically instead of
needing a broker.

**Six existing tests patch `storage.views.handle_upload_document_created`**
(`test_document.py`, `test_upload_customer_only.py`, `test_upload_document_tenant_isolation.py`,
`test_file_type_correction.py`). The view no longer references that name, so those patches would
silently stop intercepting anything. Repoint them at `storage.tasks.handle_upload_document_created`
— same intent, one line each.

**New `backend/storage/tests/tasks/test_process_upload_document.py`**:

- the task is dispatched only **after commit** — uses pytest-django's
  `django_capture_on_commit_callbacks(execute=True)`, since `on_commit` callbacks never fire inside
  the transaction pytest-django rolls back. Without this fixture a test proves nothing.
- a missing `upload_document_id` exits cleanly rather than raising.
- an `openai.RateLimitError` triggers a retry; a `TypeError` does not.
- the upload endpoint returns **201 immediately with `file_type_name = null`** — the new contract the
  frontend already renders as "Pending classification".

## 7. Docs

- **`docs/architecture/architecture.md`** — mark Redis and Celery as implemented under *Infrastructure
  & Background Processing*; note Celery Beat is still planned, not built.
- **`docs/architecture/decisions.md`** — new Backend entry recording: why processing moved off the
  request (transaction held across a third-party call), why `on_commit` is mandatory under
  `ATOMIC_REQUESTS`, why retries are scoped to `openai.APIError` rather than bare `Exception`, why
  `acks_late` + `prefetch_multiplier=1`, and that `ATOMIC_REQUESTS` stays on.
- **`docs/versions/v1-missing.md`** — the "no retry for failed classification" gap is now closed;
  update that entry.
- Feature logs per `ai/execution_context/feature_context.md`:
  `logs/{prompts,plans,implementations}/async_document_processing-<yyyy-mm-dd-hh-mm-ss>.md`.

## Out of scope

- Frontend polling / "Classifying…" state (confirmed — the existing "Pending classification" label
  plus Refresh covers it)
- Celery Beat and any scheduled sweep (confirmed)
- gunicorn, Railway deployment, Flower/monitoring — `runserver` stays for dev
- Moving the loan-verdict GPT call (`run_gpt_loan_verdict`) to a task; it has no live call site today
- Redis as a *cache* — this adds it only as a broker

## Verification

1. `make build` then `make up` → `redis`, `celery-worker`, `backend`, `postgres-db` all start; worker
   logs show it connected to the broker and registered `storage.tasks.process_upload_document`.
2. `make pytest` → new task tests pass and the existing suite holds with no regressions (baseline
   re-measured at the start of implementation, from commit `66083e9`).
3. **The point of the whole change**, measured against the running stack: upload a document and
   confirm the POST returns 201 in well under a second with `file_type_name: null`, while the worker
   log shows the classification running afterwards. Refresh the credit case page and confirm the
   document gains its type, the requirement ticks off, and the completion badge/status update as
   before.
4. Kill the worker mid-task and restart it → the job is re-delivered and completes (proves
   `acks_late`).
5. Point `CELERY_BROKER_URL` at a dead host → uploads still return 201; nothing is silently lost, the
   dispatch failure is visible.
6. `docker compose exec backend python manage.py makemigrations --check --dry-run` → clean; this
   change adds no models.
