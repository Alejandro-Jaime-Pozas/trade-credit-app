# Plan — v2 frontend: labels as dashboard columns, verdict deadlines, CSV export

Logged 2026-08-31 19:42:27. Prompt: `logs/prompts/v2_frontend_labels_and_deadlines-2026-08-31-19-42-27.md`.

## Scope

Frontend only. `backend/` was being written concurrently in the same working tree, so every unit
of work below was constrained to `frontend/`.

Covered: v2 §3 (labels — the whole frontend), v2 §5 (label columns, days passed / days remaining,
CSV export stretch). Not covered, with reasons, in the prompt log.

## Step 0 — establish the backend contract (done before any UI work)

`git diff` showed model and migration work for verdict deadlines but no serializer changes, which
would have been the wrong contract to build against. Running `./scripts/sync-api-schema.sh` against
the live stack showed the serializers were in fact already done. The regenerated
`frontend/src/lib/api.generated.ts` now carries, on `CreditCase`:

| Field | Shape | Note |
|---|---|---|
| `verdict_due_days` | `number \| null`, writable | per-case override; null = use the org default |
| `verdict_due_at` | `string \| null`, read-only | |
| `days_since_created` | `number \| null`, read-only | "days passed" |
| `days_until_verdict_due` | `number \| null`, read-only | **goes negative once overdue** |
| `is_verdict_overdue` | `boolean`, read-only | |

and on `Organization`: `default_verdict_days` (writable). `CreditCase.custom_fields`
(`{ [labelName]: string }`, read-only) was already there from the labels work.

Because `days_until_verdict_due` is signed, no date arithmetic is needed in the browser at all —
the frontend renders a number the backend already computed. That is deliberate: the backend
compares CALENDAR DATES, and a JS reimplementation would drift across timezones and DST.

## Step 1 — shared foundation (written directly, not delegated)

Three agents needed the same label API surface, so it had to exist and be stable before any of
them started. Delegating it would have meant three divergent copies.

- `frontend/src/lib/types.ts` — added `Organization`, `Label`, `LabelValue` aliases.
- `frontend/src/lib/labels.ts` (new) — the label API layer plus its pure helpers:
  - `labelColumnId(label)` → `"label:<id>"`. **Prefixed** so a user-created field named "status"
    can never collide with the built-in Status column's id and silently drive its filter. Keyed by
    id, not name, so renaming a field keeps its column state.
  - `customFieldValue(customFields, name)` — null for missing, empty AND whitespace-only.
  - `validateLabelName(name, existing, { ignoreId })` — rejects duplicates client-side because the
    backend's unique constraint surfaces as a generic 400 that reads badly.
  - `createLabel` / `renameLabel` (PATCH, never PUT — re-sending `content_type` would let a label
    be repointed at another model and orphan every value under it) / `deleteLabel` /
    `setLabelValue` (the endpoint is an upsert) / `clearLabelValue` / `listExistingValues`.
  - Write payloads are hand-typed: the generated `Label`/`LabelValue` types are the READ shape,
    where `organization` and `label` are nested `{url, display}` objects.

## Step 2 — four parallel agents, partitioned by file ownership

Partitioned by FILE rather than by feature, because the features overlap inside
`CreditCaseTable.tsx`. Each agent was given an exclusive file list and told which files belong to
others.

1. **CSV library** — `src/lib/csv.ts`, `src/lib/csv.test.ts`. Pure only, no React. Fixed public
   API agreed up front (`toCsv` / `csvFilename` / `downloadCsv`) so agent 4 could code against it
   before it existed. Required: RFC 4180 escaping, UTF-8 BOM (the data is Spanish and Excel
   mis-renders accents without it), and formula-injection neutralisation for fields starting
   `= + - @` — user-typed custom field values flow straight into this file.
2. **Custom fields page** — `src/app/labels/page.tsx` + tests, `src/lib/labels.test.ts`, and one
   nav link in `AppShell.tsx`. Create / rename / delete a credit case field, with the delete
   confirmation naming how many values it would destroy.
3. **Credit case detail** — `src/components/CustomFieldsPanel.tsx` + test, and
   `src/app/credit-cases/[id]/page.tsx`. Set/clear this case's value per field (with a
   `<datalist>` of values already in use, so "MTY Norte" is reused rather than re-typed as "MTY
   norte" and filtered as a second value), plus the deadline readout and the per-case
   `verdict_due_days` override.
4. **Dashboard columns** — `CreditCaseTable.tsx`, `tableControls.ts`, `credit-cases/page.tsx`,
   `customers/[id]/page.tsx` and their tests. The structural change v2 §5 calls out: `COLUMNS`
   stops being a module-level constant and becomes `buildColumns(labels)`, memoised on the label
   list. Body cells move into a `renderCell` on each column definition so `<thead>` and `<tbody>`
   are driven by the same array and cannot drift out of order. New `deadlineBuckets` filter kind
   (Overdue / Due today / Within 2, 5, 10 days / No deadline) with union semantics, matching the
   existing `amountBuckets` and `relativeDays`. CSV exports `visibleRows`, not `cases` — the
   user's filtered, sorted view is the whole point.

## Behaviour decided up front

- **No backfill.** Creating a field does not touch existing credit cases; they simply have no
  value for it and read as `—`. This is the honest answer to "what happens to existing rows" and
  is documented on the page itself, since a user will ask.
- Unset label values fall into the table's existing `NO_VALUE` bucket, so they filter as "—" and
  sort last exactly like every other missing value. No new null-handling.
- "Days left" renders as language, not a signed integer: `-3` → "3 days late", `0` → "Today",
  `2` → "2 days left", `null` → "—".
- A failure to load labels degrades to no label columns rather than blanking the dashboard.
- `labels` is an optional prop on `CreditCaseTable` so the customer detail page keeps compiling,
  then that page passes its labels through too — the two tables are shared precisely so they stay
  identical.

## Verification

`npm test` (full Vitest suite), `npx tsc --noEmit`, `npm run lint` — all three clean, run over the
merged result of all four agents, not just per-agent.
