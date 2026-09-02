# Implementation — v2 frontend: labels as dashboard columns, verdict deadlines, CSV export

Logged 2026-08-31 19:42:27 (feature start). Plan:
`logs/plans/v2_frontend_labels_and_deadlines-2026-08-31-19-42-27.md`.

Frontend only. `backend/` was being written concurrently in the same working tree and was
not touched, apart from `backend/schema.yaml`, which is a generated artifact refreshed by
`./scripts/sync-api-schema.sh` to pick up the backend's new deadline fields.

## Files

New:

| File | What |
|---|---|
| `frontend/src/lib/labels.ts` | Label API layer + pure helpers |
| `frontend/src/lib/labels.test.ts` | 14 tests for those helpers |
| `frontend/src/lib/csv.ts` | RFC 4180 CSV rendering + browser download |
| `frontend/src/lib/csv.test.ts` | 17 tests |
| `frontend/src/app/labels/page.tsx` | "Custom fields" management page |
| `frontend/src/app/labels/page.test.tsx` | 15 tests |
| `frontend/src/components/CustomFieldsPanel.tsx` | Set/clear a case's custom field values |
| `frontend/src/components/CustomFieldsPanel.test.tsx` | 9 tests |
| `frontend/src/components/CreditCaseTable.test.tsx` | 13 tests for the table in isolation |

Changed:

| File | What |
|---|---|
| `frontend/src/components/CreditCaseTable.tsx` | `COLUMNS` → `buildColumns(labels)`; `renderCell`/`csvValue` per column; deadline columns; CSV export |
| `frontend/src/lib/tableControls.ts` | `DEADLINE_OVERDUE`, `DEADLINE_BUCKETS`, `matchesDeadlineBuckets` |
| `frontend/src/lib/tableControls.test.ts` | 7 new boundary tests |
| `frontend/src/app/credit-cases/page.tsx` | Loads the org's labels alongside the cases |
| `frontend/src/app/credit-cases/page.test.tsx` | Fixtures gained `custom_fields` + deadline fields; 8 new tests |
| `frontend/src/app/credit-cases/[id]/page.tsx` | Custom fields panel, deadline tiles, `verdict_due_days` override |
| `frontend/src/app/customers/[id]/page.tsx` | Passes labels to the shared table |
| `frontend/src/components/AppShell.tsx` | One nav link to `/labels` |
| `frontend/src/lib/types.ts` | `Organization`, `Label`, `LabelValue` aliases |
| `frontend/src/lib/api.generated.ts`, `backend/schema.yaml` | Regenerated |

## What was built

**The dashboard column list is now dynamic.** `COLUMNS` was a module-level constant; it is
now `buildColumns(labels)`, memoised on the label list. The body used to render hand-written
`<td>`s in a fixed order, which only worked while the column list was fixed — each column now
carries its own `renderCell`, so `<thead>` and `<tbody>` are driven by the same array and
cannot put a value under the wrong heading. Widths are rescaled to total 100 after the label
columns are appended, so five custom fields don't silently squeeze the built-in columns.

Final columns: ID 5, Customer 18, Status 14, Verdict 8, Requested amount 13, Requested term 9,
Created 15, Days open 8, Days left 10, then one 10-share column per label, all rescaled.

**Label columns** read `custom_fields[label.name]`, already flattened onto each case by the
backend — no extra fetch per row. Unset values fall into the table's existing `NO_VALUE`
bucket, so they filter as "—" and sort last like every other missing value.

**Deadline columns.** "Days open" is sort-only. "Days left" gets a new `deadlineBuckets` filter
kind (Overdue / Due today / Within 2, 5, 10 days / No deadline) with the same union semantics as
the existing amount and relative-day buckets. "Within N days" deliberately EXCLUDES overdue rows
even though `-1 <= 2` arithmetically: someone planning the next two days should not have last
week's misses folded in silently. Cells read as language — "3 days late", "Today", "2 days left",
"—" — with `is_verdict_overdue` driving the danger tokens.

**Custom fields management** at `/labels`: create, rename (PATCH only, so `content_type` can never
be repointed and orphan existing values), and delete. The delete confirmation counts what it is
about to destroy before asking.

**Per-case values** via `CustomFieldsPanel` on the credit case detail page, with a native
`<datalist>` of values already in use so "MTY Norte" is reused rather than retyped as "MTY norte"
and then filtered as a second, separate value.

**CSV export** of `visibleRows` — the user's filtered, sorted view, which is the entire point of
the feature. Columns are derived from the same `ColumnDef` array as the table, so the file always
matches what is on screen, label columns included.

## Corrections made during integration

- **`csv.ts` applied its formula-injection guard to numbers.** A "days left" of `-3` starts with
  `-`, so it would have arrived in Excel as the text `'-3` rather than a number the reader can
  sort or total. The guard now covers strings only, which is where the untrusted input actually
  is (a user-typed custom field value). Added a regression test.
- **`days_until_verdict_due === 0` disagreed between the two screens** — "Today" on the dashboard,
  "0 days left" on the detail page. Zero is the deadline itself, not "no time left", and a case
  due today is still on time. Both now say so.
- **Pluralisation.** The dashboard rendered "1 days late". Both screens now use the singular.

## Deliberately left as-is, worth knowing

- **`clearLabelValue` pages the whole organization's `/label-values/` list** to find the row to
  delete. This is unavoidable given the current API — the flattened `custom_fields` map carries no
  row ids — and is fine at current volumes, but it is O(all label values in the org) per clear. A
  filterable `/label-values/?object_id=` would fix it and is a backend change.
- **`GET /labels/{id}/existing-values/` returns DISTINCT VALUES, not a case count.** The delete
  confirmation therefore says "3 distinct values are recorded ... (CDMX, GDL, MTY Norte)" rather
  than "3 credit cases". If three cases all say "MTY Norte" the endpoint returns 1, so a case-count
  wording would have understated what the delete destroys. A true count needs a backend endpoint.
- A failed value lookup renders as "unknown", never as zero — a failed count must not read as
  "nothing is recorded" and talk a user into a delete they would otherwise refuse.

## Verification

Run over the merged result of all four work units, not per-unit:

- `npm test` — **33 files, 425 tests, all passing**
- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — compiles, and `/labels` is registered as a static route

No backend tests were run: no backend source was changed.
