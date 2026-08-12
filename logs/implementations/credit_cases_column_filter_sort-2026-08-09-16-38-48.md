# Implementation — credit cases per-column filter + sort

Date: 2026-08-09
Feature: sort/filter buttons on every `/credit-cases` column except ID
Plan: `logs/plans/credit_cases_column_filter_sort-2026-08-09-16-38-48.md`

Frontend only. No backend, serializer, model, or queryset changes — rows still come from
`CreditCaseViewSet`'s org-scoped queryset and are only reordered/hidden in the browser, so no new
multi-tenant surface.

## Files changed

### `docs/versions/v1.md` (modified)
Spec recorded under the "users can filter view by status, date, etc" bullet. The user rewrote the
block with their own prompt wording; the three clarifications they gave (amount/term column split
with threshold buckets, relative-day presets for CREATED, one-column-at-a-time sort with blanks
last) were appended beneath it.

### `frontend/src/lib/tableControls.ts` (new)
Pure, React-free logic so the tricky parts are unit-testable:
- `nextSortState(current, columnId)` — asc → desc → null (default order); a different column
  restarts at asc, so only one column is ever sorted.
- `compareValues(a, b, direction)` — shared comparator; missing values always sink to the bottom in
  both directions. Strings use `localeCompare("es-MX")`.
- `searchOptions` / `toggleValue` — option search is a pure view over the option list and knows
  nothing about selection, which is what makes "search never wipes selections" structural.
- `RELATIVE_DAY_OPTIONS` (Today, Last 2/3/4/5/6/7/10/14/30/60/90/180/365 days),
  `isWithinLastDays` (calendar-day, not 24-hour), `matchesRelativeDays` (union).
- `AMOUNT_BUCKETS` (> 10M / 1M / 500k / 100k / 50k / No amount), `parseAmount`,
  `matchesAmountBuckets` (strict `>`, union).
- `STATUS_SEQUENCE`, `VERDICT_SEQUENCE`, `sequenceIndex` — sort those enums by pipeline order, with
  unknown/blank returning null so they sort last.

### `frontend/src/components/TableColumnHeader.tsx` (new)
Renders a `<th>` with a sort button (`⇅`/`▲`/`▼`, `aria-sort` on the cell) and a filter button
(count badge when active) plus its dropdown.

Key decision: the dropdown owns the **search text** (local state); the **selected values** are props
owned by the page. Clearing or retyping the search therefore cannot unselect anything. On top of
that, a selected option the current search would hide is pinned in a "Selected" group above the
results, so it stays visible while the user picks their next value.

Interaction patterns reused from the proven combobox in `credit-cases/new/page.tsx`: wrapper
`onBlur` with an `e.currentTarget.contains(e.relatedTarget)` containment check (no `setTimeout`),
`activeIndex` + ArrowUp/ArrowDown wraparound, Enter to toggle, Escape to close and return focus,
`role="listbox"`/`option` + `aria-activedescendant`. Option buttons `preventDefault` on mousedown so
the search input keeps focus — without it, macOS browsers don't focus a clicked button and the
dropdown would close before the click landed. `activeIndex` resets in the input's `onChange`, never
in a `useEffect` (`react-hooks/set-state-in-effect`).

### `frontend/src/app/credit-cases/page.tsx` (modified)
- REQUESTED split into **Requested amount** (`formatMoney`) and **Requested term** (`{n}d` / `—`);
  table is now 7 columns and the placeholder rows use `colSpan={COLUMNS.length + 1}`.
- A single `COLUMNS` descriptor array drives the header row, the filter pipeline and the sort
  pipeline, so they can't drift apart. Each entry declares `sortValue`, a `FilterKind`
  (`values` | `amountBuckets` | `relativeDays`), and how to derive its option value.
- State: `filters: Record<string, string[]>` and `sort: SortState` (null = load order).
- Removed the old top-right status `<select>` and its `statusFilter` / `uniqueStatuses` state — the
  Status column's own filter replaces it.
- Derivation order: `filteredRows` (AND across columns, OR within one) → `optionsByColumn` (counts
  computed against rows passing all *other* columns' filters) → `visibleRows` (sort applied last, so
  clearing the sort falls back to the load order for free).
- Added an active-filter chip bar with per-chip removal and "Clear all filters"; the empty state now
  distinguishes "No credit cases found." from "No credit cases match the current filters."

### Tests (new)
- `frontend/src/lib/tableControls.test.ts` — 24 tests: the sort cycle, null sinking, option search,
  calendar-day boundaries, union semantics for buckets and presets, enum sequencing.
- `frontend/src/components/TableColumnHeader.test.tsx` — 11 tests against a stateful harness that
  holds selection in the parent (a stateless harness would miss the point). Covers the headline
  requirement verbatim: search → select → clear search → select another → both stay selected; plus
  pinning, keyboard-only selection, Escape focus return.
- `frontend/src/app/credit-cases/page.test.tsx` — 13 tests covering the page wiring with `@/lib/api`
  and the shell components mocked: every non-ID column has both buttons, the three-click sort cycle
  reorders real rows, status sorts by pipeline order, filters AND across columns, faceted counts
  react to other filters, chips and "Clear all filters" work, and the two empty states differ.

## Verification

- `npm test` → **102 passed** (8 files), up from 79.
- `npx tsc --noEmit` → clean.
- `npm run lint` → clean.
- `docker exec trade_credit_app-backend-1 python -m pytest -q` → **90 passed, 6 skipped**
  (unchanged; no backend edits).
- Dev server compiles `/credit-cases` with no errors; route returns 200.

## Known limitations

- Filtering/sorting is client-side over the full `drfListAll` result, matching the page's existing
  behaviour. Fine at current data volumes; server-side filtering would be a separate change.
- The relative-day window is evaluated against `new Date()` when filters recompute, so a page left
  open across midnight keeps its last-computed "today" until the next interaction.
