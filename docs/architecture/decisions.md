
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

### Background document processing (Celery + Redis)

Decided 2026-08-15. Document classification used to run inline in the upload request.

**Why it moved.** `handle_upload_document_created` makes three OpenAI round trips per document
(upload → classify → extract), 10–30s. Because `ATOMIC_REQUESTS = True` wraps every request in one
database transaction, a Postgres connection was held open — inside a transaction — for that entire
third-party call. The frontend uploads files in parallel, so ten users with four files each meant
forty concurrent long-lived connections against a Postgres default of 100. The database was doing
nothing but waiting on OpenAI.

**`transaction.on_commit` is mandatory here, not stylistic.** Under `ATOMIC_REQUESTS` the new row is
not committed until the view returns. A bare `.delay()` publishes immediately, and the worker — a
separate process on its own connection — routinely wins that race, looks up an id that is not yet
visible, and finds nothing. The document is then silently never classified, intermittently. Queue
via `transaction.on_commit(...)` so the message is only published after the commit.
  - the same rollback behaviour is why tests must use pytest-django's
    `django_capture_on_commit_callbacks(execute=True)` to exercise the task; each test runs in a
    transaction that is rolled back, so on_commit callbacks never fire on their own and a naive test
    passes while asserting nothing.

**`ATOMIC_REQUESTS` stays on.** An earlier suggestion to mark the upload view
`non_atomic_requests` is moot: the request now only performs a database insert, so the transaction
lasts milliseconds.

**Retries are scoped to `openai.APIError`, not bare `Exception`.** Rate limits, timeouts, connection
errors and 5xx are all `APIError` subclasses and genuinely succeed on a second attempt. A `TypeError`
in our own code would fail identically three more times, cost three more API calls, and bury the
traceback — bugs should fail once and loudly. Backoff with jitter avoids hammering a service that
just asked us to slow down.
  - this closes a real hole: previously a rate-limited document kept `file_type_name = null`
    forever, satisfied no requirement, and silently prevented its credit case from ever reaching
    `pending_final_verdict`.

**`task_acks_late = True`** — a job is acknowledged only when it finishes, so a worker killed
mid-classification returns it to the queue rather than losing it. Safe because re-running
classification overwrites its own output.

**`worker_prefetch_multiplier = 1`** — the default of 4 lets one worker reserve several jobs up
front, which suits short tasks. These are long and uneven, so one worker could sit on four
30-second jobs while another idles.

**An explicit OpenAI timeout was added** (`OPENAI_REQUEST_TIMEOUT_SECONDS`, default 120). Without
one a hung connection pins a worker slot indefinitely; with it the call raises `APITimeoutError`,
which is retried by the rule above.

**API contract change:** `POST /upload-documents/` now returns 201 with `file_type_name = null`.
The frontend rendered that as a static "Pending classification" badge that never updated — polling
and a "Classifying…" state were deferred at the time, and were built on 2026-08-17 (see "The
backend decides whether a document is still being classified" below).

**Not built:** Celery Beat, any scheduled sweep for stuck documents, Redis as a cache, gunicorn.
`runserver` remains the dev server.


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


### The classifier runs on GPT-5 Nano, the cheapest model, and its mistakes are expected

Decided 2026-08-18. Records a cost tradeoff that was already in the code
(`integrations/openai/constants.py`) but never written down, so that the accuracy it buys
is not mistaken for a bug in the classification pipeline.

Every OpenAI call the app makes — deciding what type an uploaded document is, and pulling
structured fields out of it — runs on **`gpt-5-nano`**, set once as `GPT_MODEL_VERSION` and
used by all three call sites in `integrations/openai/services/gpt.py`.

**WHY nano: money.** It is the cheapest model in the GPT-5 family by a wide margin, and
this app is API-call-heavy by design — classification costs three round trips per
uploaded file, and a single credit case can carry a dozen documents. On a bigger model the
same workload costs multiples of that for a feature no one is paying for yet.

**The cost being accepted, stated plainly: nano is not as smart, and it will get things
wrong more often than a more advanced model would.** Concretely, and more frequently than
`gpt-5` would:
  - **Misclassification** — labelling a document as the wrong file type. The failure that
    matters, because `file_type_name` is what ticks a requirement off: a mislabelled
    document silently fails to satisfy the requirement it should, and can leave a credit
    case sitting in "missing documents" while the document is right there.
  - **Falling back to `unknown`** — the classifier declining to commit. Visible and honest,
    and the least harmful of the three.
  - **Extraction misses** — a field left null or filled with the wrong value (dates, names,
    amounts). Low-quality phone photos and dense multi-page scans are where this shows up
    most.

**This is why correctability is built in rather than bolted on.** The design decisions
around classification already assume the model is fallible:
  - `file_type_name` is deliberately writable on the API (`storage/serializers.py`), so a
    user can correct a wrong type; the value is validated against the organization's own
    file types, so a correction cannot invent one.
  - A document with no answer eventually reports `unclassified` rather than spinning
    forever (§ "The backend decides whether a document is still being classified"), which
    hands the user the same control when the job never landed at all.
  - `is_legible` on `PresenceOnlyPydantic` gives the model an explicit way to say "I cannot
    read this" instead of guessing.

**Upgrading is a one-line change.** `GPT_MODEL_VERSION` is the single source of truth —
switching it to `'gpt-5'` changes every call site at once, with no other code edits. The
trigger to do it is user complaints about accuracy, or the day a wrong classification costs
more than the API bill saves; until then, cheap-and-correctable beats
expensive-and-still-not-perfect. `DocumentDataExtract.model_version` records which model
produced a given extraction, so the two can be compared on real documents rather than by
intuition.

### Presence-only file types share one extraction model

Decided 2026-08-17. Introduced while expanding the file type catalog from 5 requirable
document types to 22.

Every entry in `core/file_type_catalog.py` must name a pydantic model, which is used only
to generate the JSON Schema that tells OpenAI what to pull out of that kind of document
(`GPTService.get_pydantic_model_json_schema`). Several of the new types have nothing worth
pulling out: a pagaré (promissory note), a CURP printout, photographs of the business
premises. The app only needs to know that a legible document of that kind arrived.

**They share one `PresenceOnlyPydantic`** (`integrations/openai/services/pydantic_models/file_type_models.py`)
with three fields — `document_date`, `is_legible`, `summary`.
  - WHY not one bespoke model each: five near-identical schemas is ceremony that has to be
    kept in sync by hand, for no extra information.
  - `document_date` earns its place because `create_friendly_file_name`
    (`storage/services/db_object_handling.py`) needs something to build a readable name
    from, otherwise these documents show the raw upload filename forever.
  - `is_legible` is the one genuinely useful judgement GPT can make here — a photo of a
    shop front or a phone snapshot of an ID can easily be too dark or cropped to use.

**Deliberately NOT reused: `UnknownFileDataPydantic`.** That model is the classifier's
"I could not tell what this document is" bucket. Pointing a perfectly valid pagaré at it
would make a successful classification indistinguishable from a failed one, destroying the
only signal the app has that classification went wrong. `test_file_type_catalog.py` pins
this: no spec other than `unknown` itself may use that model.

### A file type's `category` is a recency bucket, not a subject grouping

Decided 2026-08-17. Clarifies an existing field whose meaning became load-bearing once the
catalog grew large enough to have obvious "subject" groupings.

`FileTypeCategory` has three values — `FINANCIAL`, `LEGAL`, `OTHER` — and the only thing
they control is `MAX_MONTHS_BACK_BY_CATEGORY` in `core/file_type_spec.py`: how many months
old a document may be and still count toward a requirement (financial 2, legal 3, other
unlimited).

**So category is assigned by how fast the document goes stale, not by what it is about.**
An acta constitutiva (articles of incorporation) is unmistakably a legal document, but it
is category `OTHER`, because a company incorporated in 2003 will never produce one dated
within the last three months and a `LEGAL` bucket would reject every valid copy. Same for
`declaracion_anual` — an annual tax return is always older than any recency limit worth
having.

**A fourth category is not a safe addition.** Two things would break quietly:
  - `max_months_back()` looks the category up with Python's `dict.get()`, which returns
    `None` for a missing key rather than raising — and `None` means "no recency limit at
    all". A typo'd or newly invented category therefore silently disables the check
    instead of failing loudly.
  - `processing/services/credit_case.py` reads the `FINANCIAL` and `LEGAL` buckets by name
    at module import, so a fifth bucket would simply be invisible to it.

`test_file_type_catalog.py` asserts every spec's category is one of the three AND has an
entry in `MAX_MONTHS_BACK_BY_CATEGORY`, so this cannot regress unnoticed.

COST: the catalog's human-readable groupings (Tax/SAT, Legal, Credit, Collateral) now
disagree with the `category` field. Those groupings live as comments in the catalog and as
section headings in `docs/architecture/file_type_catalog_reference.md`. Giving the UI real
subject grouping needs a SEPARATE display field; overloading `category` for it would
silently change document expiry rules. That field was built the next day — see
`FileTypeSpec.group` below.

### `FileTypeSpec.group` is that separate display field

Decided 2026-08-18. Builds the field the entry above says is needed, and closes the "UI
grouping" open decision in `docs/architecture/file_type_catalog_reference.md`.

The catalog grew from 5 document types to 22, and the picker rendered them as one flat row
of buttons — fine at 5, unusable at 22. Grouping them needed a heading per type, which
`category` cannot supply for the reason set out directly above: it is a recency bucket, so
grouping by it would file articles of incorporation under "Other", where nobody would look.

`FileTypeSpec.group` is therefore display-only, mirrored onto `storage.FileType.group`
(migration `0011`) and copied over by the same `sync_global_file_types` helper as every
other catalog field — so adding a file type is still a one-file edit. Its values are the
section headings already used in `file_type_catalog_reference.md`: Financial, Tax / SAT,
Legal / corporate, Credit process, Collateral / aval (declared, no members yet),
Operational, Other.

**The frontend is told the grouping, never asked to know it.** `FileTypeSerializer` sends
`group` (stable key), `group_label` ("Fiscales / SAT") and `group_order` (position in the
reading order the catalog declares). The frontend buckets and sorts by those and keeps no
list of its own — the same rule that already governs file types themselves, for the same
reason: a hardcoded copy goes stale the day a group is added, silently. `group_order` is
what stops groups falling back to alphabetical, where "Fiscales / SAT" would precede
"Financieros".

**The data migration matters more than the columns.** Migration `0009` seeds the FileType
rows on a fresh database and runs BEFORE `0011` adds these columns, so the two `AddField`s
alone would leave every row at `group='other'` on a brand new install — the whole catalog
under one meaningless heading. `0011` re-runs the catalog sync after the columns exist,
which is what actually fills them in.

**Adding a field to `SYNCABLE_FIELDS` is a migration-safety question, not a bookkeeping
one.** `sync_global_file_types` is handed a HISTORICAL model by data migrations, and
migration `0009` calls it two migrations before these columns exist — so simply listing the
new fields made `manage.py migrate` die with `FieldError: Invalid field name(s) for model
FileType` on every fresh database, while existing ones (whose `0009` had already run) were
untouched. `syncable_fields_for()` now narrows the write to the fields the given model
version actually has, so an early migration seeds what existed then and the migration that
ADDS a field is the one that fills it in. Regression tests in
`core/tests/test_file_type_sync.py` build the real historical state with `MigrationExecutor`
rather than a stub, because the stub would not have caught this.

**`is_default_suggestion` was exposed at the same time.** The catalog had flagged 11 types
as a sensible starting set since it was written, and the frontend could not see it. It now
drives a "Select suggested" shortcut, which is what makes a 22-document catalog approachable
on first setup.

**Guard against the silent failure.** `group` has a default, so forgetting it on a new
catalog row is invisible — the document just quietly appears under "Other".
`test_no_requirable_type_falls_back_to_other` fails the build instead.

### Equivalence groups were designed and then dropped before shipping

Decided 2026-08-17. Records a rejected design so it is not re-invented from scratch.

Some documents prove the same fact by different means: the Alta en Hacienda (form R1), the
Cédula de Identificación Fiscal, and the Constancia de Situación Fiscal all establish that
a company is registered with the tax authority. The plan was an `equivalent_group` field on
`FileTypeSpec`, so a requirement could be satisfied by any one member of the group.

**Dropped because, after the v1 cut, no group had more than one member.** Both alternatives
to the Constancia were deferred to v2, leaving `registro_fiscal` with a single member —
which is just an ordinary requirement. The other candidate, official photo ID, turned out
not to need the mechanism at all: `identificacion_oficial` is ONE file type covering INE,
passport and driving licence, with a `tipo_identificacion` field recording which was
actually supplied.

Shipping the field anyway would have meant a `FileTypeSpec` attribute, matching logic in
`CreditCase.missing_file_type_names`, and tests — all for zero live use, and all of it
plausible-looking enough that a later reader would assume it was doing something.

Revisit when `alta_hacienda_r1` or `cedula_identificacion_fiscal` lands; the reasoning is
kept in `docs/architecture/file_type_catalog_reference.md` rather than in code.

### `months_required` records real values even though nothing enforces them

Decided 2026-08-17. Makes an existing gap explicit rather than papering over it.

`FileTypeSpec.months_required` says how many distinct months a document must cover — 12 for
bank statements, 1 for a balance sheet. **For credit cases it currently does nothing.**
`CreditCase.missing_file_type_names` (`processing/models.py`) is a plain set subtraction of
uploaded file type keys from required ones, with a `TODO` on it, so a single uploaded bank
statement satisfies a 12-month requirement. Month-coverage machinery does exist
(`check_aggregate_satisfied_month_intervals`) but hangs off `AccountApplication` and is
gated on `type == 'loan'`.

**The 17 new types still carry honest values** (12 for monthly filings like
`declaraciones_provisionales`, 1 for point-in-time documents, `None` for timeless ones like
`acta_constitutiva`).
  - WHY not zero them out: the values are correct domain facts, and writing `None`
    everywhere would mean re-researching all 22 types when enforcement lands.
  - WHY not enforce it now: `missing_file_type_names` drives `requirements_complete`, which
    drives the credit case status transitions in
    `processing/services/credit_case_status.py`. Turning enforcement on would immediately
    move existing cases backwards out of `pending_final_verdict`, and it needs to land with
    the related `quantity` work rather than as a side effect of adding documents.
  - The docstring on the field now says all of this, so nobody reads `months_required=12`
    and assumes it is being checked.

Also unresolved and recorded there: the field counts MONTHS, but "two fiscal years of
audited financials" means two annual documents, not 24 months.


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

### Colour lives in design tokens, not in components

Decided 2026-08-18, when light/dark mode was added.

Every colour in the frontend used to be a hardcoded Tailwind palette class — `bg-white`,
`text-zinc-600`, `border-red-200` — spread across ~24 files. That is fine with one theme and
impossible with two: there is no single place to restate the palette.

**Components now name a ROLE, and `globals.css` decides what that role looks like.**
`bg-surface` instead of `bg-white`, `text-fg-muted` instead of `text-zinc-600`,
`border-danger-line bg-danger-surface text-danger` instead of the red-200/50/800 trio. Each
token is defined twice — light values on `:root`, dark values on `.dark` — and exposed to
Tailwind through `@theme inline`, which is what makes the generated CSS reference
`var(--surface)` at use time instead of baking in today's value.

**Why not `dark:` variants.** The obvious alternative is to keep the palette classes and add a
`dark:` twin to each of the ~400 colour utilities. It costs the same edit on the first pass and
more on every pass after: every class list doubles in length, and every new component has to
remember its own twin or it silently breaks in one theme. With tokens, a component written a
year from now is themed correctly by default.

**The theme is a class on `<html>`, not a media query.** `prefers-color-scheme` cannot be
overridden from inside the page, and the app has a toggle button, so `src/lib/theme.ts` owns a
`dark` class instead and `@custom-variant dark` teaches Tailwind to match it. Precedence:
an explicit choice (persisted in `localStorage`) beats the OS setting; with no choice stored the
OS wins, including when it changes later.

**The theme is applied before first paint.** `THEME_INIT_SCRIPT` is a plain inline `<script>` in
the root layout's `<head>` — not `next/script`, whose inline strategies all run after hydration
has begun, which is exactly late enough for a dark-mode user to see a white flash. `<html>`
carries `suppressHydrationWarning` because that script legitimately mutates it before React
hydrates.

**`useSyncExternalStore`, not `useState` + `useEffect`.** The theme genuinely lives outside React
(on the `<html>` element, put there before React loads), and this repo's
`react-hooks/set-state-in-effect` rule rejects the usual mount-sync pattern anyway. The hook
lives in `src/lib/useTheme.ts`, separate from `src/lib/theme.ts`, because the root layout is a
Server Component and cannot import a module that depends on client-only hooks.

**Two deliberate light-mode changes came with this.** Tailwind v4 dropped the default border
colour, so the app's ~130 bare `border` classes were painting in `currentColor` (near-black);
they now default to the border token. And inputs that carried no background class were relying
on whatever sat behind them being white; form controls now get the surface token explicitly,
since a transparent input is invisible in dark mode.

**One deliberate exception**: `StatusDot`'s status colours stay literal (`bg-green-500`,
`bg-red-500`, ...). They are signal colours, not surfaces — the same meaning in both themes, and
legible against both backgrounds.


### Document names are shown in Spanish, and one function decides that

Decided 2026-08-20.

The app's users are Mexican credit teams. They know the document as a *pagaré*, not a
"promissory note", and as an *acta constitutiva*, not "articles of incorporation". The UI
was printing the English name everywhere.

No translation work was needed: every entry in `core/file_type_catalog.py` has always
carried both `label_en` and `label_es`. This was purely a question of which one the UI
reads. Nothing was renamed and nothing was dropped — the English name is still stored on
`storage.FileType`, still served by every endpoint that serves the Spanish one, and
explicitly kept for a future language toggle.

**The choice lives in exactly one function.** `fileTypeDisplayLabel()` in
`frontend/src/lib/fileTypes.ts` takes anything carrying the two labels and returns the one
to print. Every component that renders a document name — `FileTypePicker`,
`FileTypeChooser`, `FileTypeSelect`, `ImpactWarning`, and `fileTypeLabel()` itself — goes
through it. The alternative, swapping `.label_en` for `.label_es` at each call site, would
have worked identically today and cost a scavenger hunt the day the app grows a real
language switch. It falls back to the English name when a type has no Spanish one,
because a name in the wrong language beats a blank where a name should be.

**Searching still matches both names and the key.** A user who learned these documents in
English, or who is pasting a key out of a URL, must still find them. `searchFileTypes()`
already did this; `FileTypeSelect` did not, and now carries a separate `search` field per
option so the visible label and the matchable text can differ.

**Group headings are Spanish with no English counterpart.** `FILE_TYPE_GROUPS` in the
catalog holds one heading per group, and they are printed directly above the Spanish
document names — an English heading over a Spanish list reads as a bug. Unlike the file
types there is no second English heading stored anywhere, so that tuple is the one place
that would have to gain one.

**Ordering moved to `label_es` too** (migration `0012`, `AlterModelOptions` only — no DDL).
A list sorted by the English name looks shuffled to someone reading the Spanish one:
"Pagaré" would sit under P-for-Promissory-note. Note that the *database* does this
sorting, and Postgres' default collation ignores case, accents and spaces where Python's
`sorted` does not — hence the `alphabetical_key` helper in
`storage/tests/views_serializers/test_requirements.py`, without which the test asserting
the list arrives sorted fails on "Declaración anual" vs "Declaraciones provisionales".

**Deliberately NOT done: the rest of the UI.** Buttons, table headers, statuses and error
messages are still English. The request was about document names, and translating the
whole app is a separate piece of work with its own decision to make (a real i18n layer vs.
hardcoded Spanish).
