
# Decisions

The purpose of this file is to detail high impact decisions made to the full stack app's architecture, when they were made, and their reasoning. This to provide future Claude code or other AI code sessions and agents with a proper reasoning context made for high impact decisions. 

## DB

- database atomicity:
  - currently making all db transactions atomic in settings.py with "ATOMIC_REQUESTS": True,
  - this hurts performance, will later need to switch..
  - INCLUDE @transaction.atomic MOVING FORWARD IF MULTI-STEP DB WRITE PROCESS, TO PREP LATER WHEN REMOVING GLOBAL SETTING


## Backend

### Document requirements (file type catalog → org templates → per-case snapshots)

Decided 2026-08-11. Replaces the hardcoded `CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED` set, which used
to make every credit case in every organization require the same five documents.

**One source of truth for file types.** `backend/core/file_type_catalog.py` is the only place a file
type is defined. To add one, add a `FileTypeSpec` to `FILE_TYPE_CATALOG` and run
`manage.py sync_file_types` — nothing else. Everything derives from it: the valid
`UploadDocument.file_type_name` values, the labels GPT may classify a document as, the extraction
schema per type, month requirements, recency limits, and the `storage.FileType` table.
  - split across two modules on purpose, because the catalog is expected to grow long:
    `file_type_catalog.py` holds ONLY `FileTypeSpec`/`FileTypeCategory` and the catalog tuple itself,
    while `file_type_spec.py` holds everything derived from it (`FILE_TYPE_KEYS`, `PYDANTIC_BY_KEY`,
    `DEFAULT_SUGGESTION_KEYS`, `months_required_by_category()`, ...). Application code imports from
    `file_type_spec.py`; the import is one-way, catalog never reads back.
  - it is an ordered `tuple`, not a `set`. A set's iteration order changes per process, which used to
    make `makemigrations` propose a phantom `AlterField` on `file_type_name` on almost every run.
  - `UploadDocument.file_type_name` therefore has NO `choices=`. A static enum cannot enumerate
    database rows, and file types now live in a table so organizations can eventually add their own.
  - the GPT classifier's allowed-values schema is built PER REQUEST, not frozen at import, so newly
    added types are picked up without a restart. This is also the hook org-defined types will need.

**Requirements are copied onto a credit case, not referenced from a template.** Each case owns
`CreditCaseRequirement` rows, seeded from a `RequirementTemplate` at creation.
  - WHY: this is a credit-approval system. If a case read its requirements live from a template,
    editing that template later would retroactively change what "complete" meant for cases already
    decided. A snapshot keeps the history of a reviewed case truthful.
  - it is also what makes per-case deviation possible ("this customer also needs X"), which a shared
    FK could not express.
  - COST: an org-wide change does not reach existing cases by itself. That is what impact/apply below
    is for, and it is intended behavior, not a gap.

**`source` on a requirement row is load-bearing.** `'template'` rows may be added/removed by a
re-sync; `'manual'` rows (a per-case addition for one customer) are NEVER touched by one. Without this
column, "update this case" and "destroy the customer-specific requirements someone added" would be the
same operation.

**A template edit's impact is computed live, never as a changelog.** `GET /requirement-templates/{id}/impact/`
diffs the template against each case's CURRENT rows, rather than replaying what the user just edited.
  - a run of edits produces ONE coherent prompt on save, not one per change.
  - "keep for now" is not a dead end: the case is simply out of sync and can be synced any time.
  - re-applying is idempotent, and there is no event log to build or store.

**Only open cases can be re-synced — "open" means `submitted_at is null`.** That is the moment the
requirement list stopped being a checklist and became the evidence a reviewer worked from. (Chosen
over `status == COMPLETE` and `verdict != PENDING`, both of which allow edits after submission.)

**Re-syncing never writes `credit_case.status`.** Adding a requirement to a case already in review
would otherwise knock it backwards out of the AI/review pipeline. The case just reports the new
document as missing via `missing_file_type_names`.

**Removing a requirement leaves any already-uploaded document in place** — it simply stops counting.
The impact report flags these (`removes_with_uploads`) so the user is warned before confirming rather
than discovering it after.

**Global file types are app-owned and never deactivated — only renamed.** `key` is IMMUTABLE (it is
the value already stored in every `UploadDocument.file_type_name`); `label_en`/`label_es` are what
gets renamed. `sync_file_types` only ever creates and updates, never deletes.

**Global vs. organization-owned types share one table**, split by `organization` being NULL or set.
  - creating an org-owned type is a new ROW, never an edit to a global one.
  - `OrganizationScopedMixin` cannot express "global OR mine" (it builds a single
    `filter(organization__in=...)`, which drops every NULL row), so `FileTypeViewSet` overrides
    `get_queryset` with an explicit `Q(organization__isnull=True) | Q(organization__in=...)`.
  - Postgres treats NULLs as distinct, so `unique(organization, key)` does NOT stop duplicate global
    rows — a partial unique index on `key WHERE organization IS NULL` is required as well.

**Org-created file types are DEFERRED**, written up in `docs/versions/v2.md`. The blocker is not the
requirement plumbing; it is that a custom type needs its own extraction schema for GPT. Note
`gpt.py` consumes a JSON Schema and only uses pydantic to generate one, so a custom type can store
JSON Schema directly on its row — no runtime model generation needed.

**Optional requirements** (`is_required=False`) are listed for the user but excluded from
`required_file_type_names`, so they never block completion.


### Deleting a document recomputes the credit case's status

Decided 2026-08-16. Documents could not be deleted at all before this; adding the ability
also had to answer what happens to a case that was relying on the deleted file.

`CreditCase.requirements_complete` (`backend/processing/models.py`) is a *property*, not a
stored column — it counts the case's documents every time it is read. That was a deliberate
earlier decision so the answer can never disagree with reality. But `CreditCase.status` IS
stored, and it is what a reviewer's queue is built from. Uploading the last required
document advances the status; nothing was moving it back.

So `UploadDocumentViewSet.perform_destroy` (`backend/storage/views.py`) calls
`handle_manual_requirement_change(credit_case)` after the delete:

- **Why that helper and not `handle_requirements_progress`.** The two differ in one
  important way. `handle_requirements_progress` only ever moves a case FORWARD — it is
  called after an upload, where dragging a case backwards would be wrong. Deleting is the
  opposite situation: a user has deliberately removed something from one specific case, so
  it is allowed to pull the case back to `missing_documents`. That is exactly the rule
  already written for a user adding or removing a requirement by hand, which is why the
  same helper is reused rather than a third one being written.
- **What it avoids.** Without it, deleting the only bank statement leaves the case sitting
  in `pending_final_verdict` — in a reviewer's queue, presented as ready to judge, with the
  evidence it was advanced on no longer there.
- **Cost accepted.** A delete now costs an extra status recalculation. It is a handful of
  queries against one case, on a rare user action, and runs inside the same transaction
  (`ATOMIC_REQUESTS = True`), so a failed recompute rolls the delete back with it.

### A document's display name is separate from its file name

Decided 2026-08-16. `UploadDocument.friendly_file_name` existed on the model but was listed
in the serializer's `read_only_fields`, so nothing could ever set it.

Uploads arrive named whatever produced them — `scan_0012.pdf` — which tells a reviewer
nothing. The fix is a rename, but there are two things a rename could mean, and only one of
them is safe:

- **`original_title` stays read-only.** It is the record of what the customer actually sent.
  Overwriting it would destroy the only link between the row and the file as it arrived.
- **`friendly_file_name` is writable** and is purely a display label layered on top. The
  frontend resolves the two with `documentDisplayName()`
  (`frontend/src/components/DocumentList.tsx`): friendly name if set, original file name
  otherwise, with the original still shown in the row's metadata line whenever a friendly
  name is hiding it.

A blank name is stored as `NULL`, never `''` (`validate_friendly_file_name`), so "no
friendly name" is one state in the database rather than two that every reader would have to
test for separately.

### The backend decides whether a document is still being classified

Decided 2026-08-17. Completes the Celery move above: uploads answered instantly with no file type,
and nothing ever told the browser when the worker finished.

Two things were needed — a spinner while the worker is genuinely working, and the file type
appearing without a manual page reload. Both hinge on one question the frontend cannot answer:
**is this still running?**

`file_type_name IS NULL` does not answer it. That is equally true of a document queued two seconds
ago and one whose worker died last week, and a spinner that never stops is worse than no spinner,
because it lies about what the app is doing.

**Rejected: asking Celery.** A result backend is configured (`CELERY_RESULT_BACKEND`, Redis db 1),
so the task id could be stored on the row and `AsyncResult(task_id).status` read back. Three
reasons not to:
  - Celery answers `PENDING` for a task id it has never heard of, so "queued" and "lost forever"
    come back identical — exactly the distinction being made.
  - Task results expire (24 hours by default), after which every older document reports `PENDING`
    again.
  - It costs a migration plus one Redis round trip per row in a list response.

**Chosen: derive it from time, on the backend.** `classification_status(doc)`
(`backend/storage/services/classification_state.py`) returns one of three values, exposed as a
read-only field on `UploadDocumentSerializer`:
  - `classified` — the classifier answered. Includes answering `unknown`, which is the classifier
    saying "I could not tell" — an answer, not the absence of one.
  - `processing` — no answer yet, and uploaded within `DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS`
    (default 300). The UI spins.
  - `unclassified` — no answer, and past that window. The UI stops spinning and hands the user the
    file type control so they can label it themselves.

The window is deliberately NOT the true worst case (three OpenAI calls, each up to
`OPENAI_REQUEST_TIMEOUT_SECONDS`, retried three times — over twenty minutes). Past five minutes a
dead worker is the likelier explanation than a slow one, and a usable control beats an honest but
useless spinner.

**Why the backend owns this and not the frontend.** The timeout is a backend setting, so the
verdict belongs there too — a number hardcoded in the frontend would go wrong the moment it is
tuned. It also has to survive navigation: a client-side countdown restarts on every mount, so a
document abandoned days ago would look freshly queued each time the page is opened.

**Polling, not push.** `useClassificationPolling` (`frontend/src/lib/useClassificationPolling.ts`)
re-reads every 4 seconds while at least one document on screen is `processing`, and stops the
moment none are — an idle page makes no requests at all. WebSockets/SSE were rejected as new
infrastructure (a socket layer in Django, a second protocol to scope per organization) for a payoff
of a few seconds' latency on a page the user is already watching. The refresh callback is the
page's existing full reload, so a finished classification also brings across what it can move: a
credit case's `requirements_complete` and `status`, and the RFC/address a CSF fills in on a
customer.

**Not built:** a scheduled sweep that retries documents stuck in `unclassified`. The user can set
the type by hand, and re-uploading re-queues the job.


## Deployment

### Hosting platform (not yet implemented)

Discussed 2026-08-13. The app is not deployed anywhere yet — this records the research so it doesn't
get re-litigated from scratch when deployment actually happens. Nothing below has been built.

**Recommendation: Railway**, for a 24/7-online deployment of the full stack (Django backend, Next.js
frontend, Postgres) with minimal setup. Connect the GitHub repo and Railway builds each service from
its existing `Dockerfile` (`backend/Dockerfile`, `frontend/Dockerfile`), provisions a managed Postgres
add-on, gives each service a public HTTPS URL, and redeploys automatically on every push — no new
YAML/config format to learn beyond what's already in this repo. Cost: roughly $5/mo (Hobby plan) for a
stack this small.

**Why not the obvious options:**
  - **Vercel** cannot host this app on its own. It is excellent for the Next.js frontend specifically
    (would be free), but it only runs short-lived serverless functions — it cannot run the Django
    backend or a Postgres database as an always-on service.
  - **Render** is a similar "abstracted" platform to Railway, but its free web service tier spins down
    after inactivity (defeats the "always online" requirement — the next request pays a slow cold-start),
    and its free Postgres expires after 90 days. Both end up on paid tiers anyway (~$7/mo per service),
    at a similar or higher total cost than Railway for less convenience.
  - **A bare VPS** (e.g. Hetzner ~€4.5/mo, DigitalOcean ~$6/mo) is the CHEAPEST option and would run
    `docker-compose.yml` almost unmodified (`git clone` + `docker compose up -d` + point a domain at it).
    It was not made the recommendation because it trades cost for responsibility: you own patching,
    security updates, and uptime yourself, versus Railway handling all of that. Worth revisiting if cost
    becomes the binding constraint later.

**Not yet decided:** how `OPENAI_API_KEY` / DB credentials get injected in production (Railway's own
env var UI vs. a secrets manager), and whether `ATOMIC_REQUESTS` (see DB section above) needs
revisiting once there's real production load to measure.


## Frontend

### Confirmations expire, errors do not

Decided 2026-08-16. Every success message in the app used to be a plain
`useState<string | null>` that stayed on screen until some unrelated action happened to
clear it, so a page could sit there claiming a save that happened minutes earlier.

`useTransientMessage` (`frontend/src/lib/useTransientMessage.ts`) is now the one way to show
a confirmation: `show(text)` displays it and takes it back down after
`TRANSIENT_MESSAGE_MS` (4s), restarting the countdown if a second message replaces the
first, and cancelling the pending timer on unmount so a fired timeout can never set state on
a page the user has navigated away from.

The asymmetry is the point: **error banners are deliberately left permanent.** An error is
something the user has to read and act on, and one that disappears before it is read is
worse than one that lingers. A confirmation is only useful for a few seconds — after that it
is noise.

The timeout is scheduled inside the `show` callback rather than in a `useEffect` watching the
message. `eslint-plugin-react-hooks`' `set-state-in-effect` rule rejects effect-driven state
updates (it has already bitten this repo), and no effect is needed here anyway.

- frontend testing:
  - Vitest + React Testing Library for unit/component tests (per `docs/architecture/architecture.md`'s Testing stack); Playwright/E2E deferred until there's a feature that needs it.
  - test files are colocated next to the source they cover (`foo.ts` -> `foo.test.ts`), not in a separate `__tests__/` tree.
  - `frontend/src/lib/` is the priority target: pure logic and auth/API plumbing carry more risk per line than page components, so it's covered first.
  - `frontend/src/lib/api.generated.ts` (openapi-typescript output) is excluded from the suite — it's type-only, no runtime behavior to test.
  - run via `make vitest` (mirrors `make pytest`); runs in Docker with `--no-deps` since these tests mock `fetch` and never need `backend`/`postgres-db` running.
