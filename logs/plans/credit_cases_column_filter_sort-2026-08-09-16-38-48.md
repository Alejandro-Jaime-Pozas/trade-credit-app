# Per-column sort + filter controls on `/credit-cases`

## Context

`docs/versions/v1.md:92` still has an open v1 item: *"users can filter view by status, date, etc"*,
annotated today as *"status filter only, client-side; no date-based sort/filter"*. That reflects
reality — `frontend/src/app/credit-cases/page.tsx` has exactly one control: a top-right `<select>`
bound to `statusFilter`, applied by a `useMemo` at lines 77-81. There is no sorting UI at all; rows
arrive in a fixed `updated_at desc` order applied once at load (lines 33-37).

The goal is to close that v1 item properly: every column except **ID** gets a small **sort** button
and a small **filter** button in its header. Sort cycles ascending → descending → back to the
default order. Filter opens a searchable, multi-select dropdown whose selections live independently
of its search box — so a user can search, tick a value, clear the search, and keep ticking more
values without ever losing what they already picked.

All of this stays **client-side** over the already-fully-loaded `drfListAll` result. No backend,
serializer, or queryset changes — so no new multi-tenant surface: rows still come from
`CreditCaseViewSet`'s org-scoped queryset and are only reordered/hidden in the browser.

Per `ai/execution_context/feature_context.md`, work is logged under `logs/prompts/`, `logs/plans/`,
and `logs/implementations/` as `credit_cases_column_filter_sort-<yyyy-mm-dd-hh-mm-ss>.md`.

---

## Decisions confirmed with the user

- **CREATED** filters by **relative-day presets**, not distinct timestamps:
  Today, Last 2/3/4/5/6/7/10/14/30/60/90/180/365 days.
- **REQUESTED** splits into two columns:
  - **REQUESTED AMOUNT** — filter by threshold buckets `> 10,000,000`, `> 1,000,000`, `> 500,000`,
    `> 100,000`, `> 50,000` (plus a "No amount" option for nulls). Sorts numerically.
  - **REQUESTED TERM** — filter by the terms actually present in the data (15/30/45/60/90).
    Sorts numerically.
- Deliverable is the **spec written into `docs/versions/v1.md`, then the implementation**.

## Decisions I'm making (call them out if you disagree)

- The existing top-right **Status `<select>` is removed.** The Status column's own filter button
  fully replaces it, and keeping both would mean two competing sources of truth for the same filter.
- **One sort column at a time.** Clicking another column's sort button starts that column at
  ascending and clears the previous column's sort. (Multi-column sort is a much heavier interaction
  for no stated need.)
- **Status/Verdict sort by pipeline sequence, not alphabetically.** Both enums are documented in
  `api.generated.ts` as "in order of sequence" (`missing_documents → pending_ai_verdict →
  buro_de_credito_rejected → pending_final_verdict → complete`; `pending → approved → rejected`),
  which is far more useful than A-Z.
- **Nulls/blanks sort last** in both directions, and are selectable in filters as an explicit `—`
  option.

---

## Step 1 — Write the spec into `docs/versions/v1.md`

Keep line 92 as the parent bullet (retitled, still unchecked until step 2 lands) and nest the full
instruction set directly beneath it, in the same checklist style the file already uses. Content
mirrors the "Behaviour" section below: the column list, the sort cycle, the filter dropdown
contract (searchable, multi-select, selections survive clearing the search), the CREATED presets,
and the AMOUNT buckets.

## Step 2 — `frontend/src/lib/tableControls.ts` (new)

All decision logic lives here as pure functions, so it is unit-testable without a DOM — matching how
`format.ts`, `creditCase.ts`, and `storage.ts` are already structured and tested.

- `type SortDirection = "asc" | "desc"` and `type SortState = { columnId: string; direction: SortDirection } | null`.
- `nextSortState(current, columnId)` — implements the asc → desc → **null (default order)** cycle for
  the clicked column, and resets to `asc` when a different column is clicked.
- `compareValues(a, b, direction)` — shared comparator handling `number | string | null`, always
  sinking nullish/blank values to the bottom regardless of direction.
- `type FilterOption = { value: string; label: string; count: number }`.
- `searchOptions(options, query)` — case-insensitive substring match on `label`. **Pure and
  independent of selection state**, which is what makes the "search doesn't wipe selections"
  requirement structural rather than something the UI has to remember.
- `toggleValue(selected: string[], value: string)` — add/remove one value.
- `RELATIVE_DAY_OPTIONS` — the Today/2/3/…/365 preset list, each `{ value: "<days>", label }`.
- `isWithinLastDays(iso, days, now)` — calendar-day comparison (`Today` = same calendar day as `now`),
  so "Last 7 days" doesn't drift by hours.
- `AMOUNT_BUCKETS` — the five `>` thresholds, each `{ value: "<threshold>", label }`, plus the
  `"__none__"` no-amount sentinel.
- `matchesAmountBuckets(amount, selectedValues)` / `matchesRelativeDays(iso, selectedValues, now)` —
  **union** semantics for overlapping ranges (selecting `> 500,000` and `> 1,000,000` yields
  everything over 500,000; selecting `Last 7 days` and `Last 30 days` yields the last 30).

## Step 3 — `frontend/src/components/TableColumnHeader.tsx` (new)

One `<th>`-rendering component owning the label, both buttons, and the filter popover. Placed flat
in `src/components/` alongside `AppShell.tsx` / `CustomerFormFields.tsx`, matching the existing
convention (there is no `components/table/` subdir today).

Props: `label`, `sortDirection` (`"asc" | "desc" | null`), `onToggleSort`, `options: FilterOption[]`,
`selected: string[]`, `onToggleValue`, `onClearColumn`.

- **Sort button** — a small icon button showing `▲` / `▼` / a neutral `⇅` in the default state, with
  `aria-label` naming the next action (e.g. `Sort by Status ascending`) and `aria-sort` on the `<th>`.
- **Filter button** — shows a count badge when `selected.length > 0` so active filters are obvious
  with the dropdown closed.
- **Dropdown** — reuse the keyboard/ARIA patterns already proven in
  `credit-cases/new/page.tsx:112-145, 258-355` rather than inventing a second interaction model:
  - `onBlur` on the wrapper with an `e.currentTarget.contains(e.relatedTarget)` containment check
    (not a `setTimeout` hack) to close only when focus truly leaves.
  - `activeIndex` state + ArrowUp/ArrowDown with wraparound, `Enter`/`Space` to toggle the active
    option, `Escape` to close and return focus to the filter button.
  - `role="listbox"` / `role="option"` with `aria-selected`, stable option ids, and
    `aria-activedescendant` on the search input.
  - **Lint note:** reset `activeIndex` inside the search input's `onChange`, never in a `useEffect` —
    `eslint-plugin-react-hooks`' `set-state-in-effect` rule errors on the latter (hit earlier in this
    repo).
- **The selection-persistence rule** (the crux of the request): the dropdown's search query is
  *local* component state; the selected values are *page* state passed in as props. Clearing or
  retyping the search can therefore never touch selections. On top of that, any selected option that
  the current search text filters out is still rendered, pinned in a small **"Selected"** group above
  the search results — so a user searching for their second value can always see the first one is
  still on.
- A **"Clear"** action at the bottom clears just that column.

## Step 4 — Wire up `frontend/src/app/credit-cases/page.tsx`

- Split the REQUESTED `<td>` (line 180-182) into **Requested amount** (`formatMoney(...)`, reusing
  `@/lib/format`) and **Requested term** (`{n}d`). Table goes to 7 columns; update the two
  `colSpan={6}` placeholders (lines 143, 149).
- Define a `COLUMNS` descriptor array — one entry per non-ID column with `id`, `label`,
  `sortValue(cc)`, and a filter strategy (`"values"` for Customer/Status/Verdict/Term,
  `"buckets"` for Amount, `"relativeDays"` for Created). This keeps the header row and the
  filter/sort pipeline driven by one list instead of seven hand-written branches.
- State: `const [sort, setSort] = useState<SortState>(null)` and
  `const [filters, setFilters] = useState<Record<string, string[]>>({})`.
- Delete `statusFilter` / `uniqueStatuses` and the top-right `<select>` (lines 23, 83-86, 106-118).
- Derive in `useMemo`, in order:
  1. `filteredRows` — every row passing **all** active column filters (AND across columns, OR within
     a column).
  2. `optionsByColumn` — per column, the option list with counts computed against rows matching all
     **other** columns' filters, so a count never promises rows that another filter has already
     removed.
  3. `visibleRows` — `sort === null ? filteredRows : [...filteredRows].sort(cmp)`. Because the
     default `updated_at desc` order is preserved on the underlying `cases` array, the third sort
     click restores it for free.
- Customer sorting/filtering keys off the resolved name in `customersByUrl` (already built at lines
  40-58), falling back to `—` for unresolved rows.
- Add a thin **active-filters bar** above the table: one removable chip per selected value plus a
  **"Clear all filters"** button, and update the empty-state copy to distinguish "no credit cases"
  from "no rows match your filters".
- Update the stale subtitle at line 95 ("dev-mode: no server-side filtering yet") to say filtering
  and sorting are applied client-side over all loaded cases.

## Step 5 — Tests

`npm test` runs Vitest; `@testing-library/react` + `user-event` are already installed and
`vitest.setup.ts` already wires `jest-dom` and RTL `cleanup`. There are no component tests yet — this
adds the first, following the documented style of `src/lib/format.test.ts`.

- **`frontend/src/lib/tableControls.test.ts`** — `nextSortState` full three-click cycle and the
  reset-on-different-column case; `compareValues` sinking nulls in both directions; `searchOptions`
  case-insensitivity; `isWithinLastDays` boundaries (today, exactly N days ago, N+1 days ago);
  `matchesAmountBuckets` union semantics and the no-amount sentinel.
- **`frontend/src/components/TableColumnHeader.test.tsx`** — the interaction contract:
  - sort button cycles `⇅ → ▲ → ▼ → ⇅`, firing `onToggleSort` each time;
  - dropdown opens, typing in the search narrows the option list;
  - **the requirement verbatim**: type a search → select a value → clear the search → the value is
    still checked and still reported selected → search again → select a second value → both remain
    selected;
  - a selected option filtered out by the current search still renders in the pinned "Selected" group;
  - ArrowDown/Enter toggles via keyboard; Escape closes the dropdown.

## Verification

1. `cd frontend && npm test` — full Vitest suite green, including the two new files.
2. `cd frontend && npx tsc --noEmit && npm run lint` — both clean (watch for
   `react-hooks/set-state-in-effect`).
3. Manual against the running stack at `http://localhost:3000/credit-cases`:
   - Sort each column three times → ascending, descending, back to the original `updated_at desc`
     order; starting a sort on a second column clears the first.
   - Status filter: pick two statuses → only those rows show; the removable chips reflect both.
   - Created filter: pick `Last 7 days` → older rows disappear; add `Last 30 days` → the set widens.
   - Requested amount: pick `> 1,000,000` → only larger amounts; `No amount` surfaces the `—` rows.
   - **The search-persistence path**: open the Customer filter, type a partial name, tick it, clear
     the search box → the tick and the chip survive; type a different name, tick it → both stay
     selected and both chips show.
   - Keyboard only: Tab to a filter button, Enter to open, ArrowDown/Enter to toggle, Escape to
     close and land back on the button.
   - Combine a filter + a sort, then "Clear all filters" → all rows return, sort still applied.
4. Regression: `/credit-cases/<id>` and `/customers` are untouched and still render (the shared
   `formatMoney`/`formatDate` helpers are only read, never changed).
