import { parseAmount } from "./money";

/**
 * Pure helpers backing the per-column sort + filter controls on the credit
 * cases table (see `src/components/TableColumnHeader.tsx` and
 * `src/app/credit-cases/page.tsx`).
 *
 * Everything here is deliberately free of React and of the DOM: the table's
 * behaviour is decided by these functions and only *rendered* by the
 * component, which keeps the tricky parts (the three-step sort cycle, null
 * ordering, overlapping bucket ranges) unit-testable in isolation.
 */

// ── Sorting ────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

/** Which column is sorted and how. `null` means "default order" (no sort applied). */
export type SortState = { columnId: string; direction: SortDirection } | null;

/**
 * Works out the next sort state after the user clicks a column's sort button.
 *
 * Clicking the same column cycles ascending -> descending -> default (null).
 * Clicking a *different* column abandons the previous sort and starts the new
 * column at ascending, so only ever one column is sorted at a time.
 */
export function nextSortState(current: SortState, columnId: string): SortState {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: "asc" };
  }
  if (current.direction === "asc") {
    return { columnId, direction: "desc" };
  }
  // Was descending -> third click returns the table to its default order.
  return null;
}

/** A value a column can be sorted by. `null` stands for "missing/blank". */
export type SortValue = string | number | null;

/**
 * Comparator shared by every column.
 *
 * Missing values (null/undefined/empty string) always sink to the bottom of
 * the table regardless of direction — a row with no requested amount is never
 * more interesting than one that has one, so it shouldn't lead the list just
 * because the user flipped to descending.
 */
export function compareValues(
  a: SortValue | undefined,
  b: SortValue | undefined,
  direction: SortDirection,
): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  let result: number;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    // `localeCompare` so accented customer names (común in es-MX data) order
    // the way a Spanish speaker expects rather than by raw code point.
    result = String(a).localeCompare(String(b), "es-MX", { sensitivity: "base" });
  }

  return direction === "asc" ? result : -result;
}

// ── Filter options ─────────────────────────────────────────────────

/** One selectable row in a column's filter dropdown. */
export type FilterOption = {
  /** Stable identifier stored in the page's selection state. */
  value: string;
  /** What the user reads in the dropdown. */
  label: string;
  /** How many rows this option would match. */
  count: number;
};

/** Sentinel `value` used for rows whose column value is missing. */
export const NO_VALUE = "__none__";

/** Label shown for {@link NO_VALUE} in value-list columns. */
export const NO_VALUE_LABEL = "—";

/**
 * Narrows a dropdown's options by its search box text.
 *
 * Note what this function does *not* do: it knows nothing about which options
 * are selected. That is the whole point — search is a pure view over the
 * option list, so clearing the search box can never disturb the user's
 * selections (which live in separate page state).
 */
export function searchOptions(options: FilterOption[], query: string): FilterOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.label.toLowerCase().includes(q));
}

/** Adds `value` to the selection if absent, removes it if present. */
export function toggleValue(selected: string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value];
}

// ── CREATED column: relative-day presets ───────────────────────────

/**
 * Preset ranges offered by the CREATED column's filter.
 *
 * A distinct-timestamp list would give one option per row, so instead the user
 * picks a window. `value` is the window length in days, as a string, because
 * selection state is a `string[]` shared by every column.
 */
export const RELATIVE_DAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "0", label: "Today" },
  ...[2, 3, 4, 5, 6, 7, 10, 14, 30, 60, 90, 180, 365].map((d) => ({
    value: String(d),
    label: `Last ${d} days`,
  })),
];

/** Midnight local time on the calendar day `iso` falls in, or null if unparseable. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * True when `iso` falls inside the last `days` calendar days, counting today
 * as day 1. `days = 0` means "today only".
 *
 * Compared by calendar day rather than by elapsed hours, so "Last 7 days"
 * means seven dates on a calendar and doesn't shift depending on what time of
 * day the user happens to look at the page.
 */
export function isWithinLastDays(
  iso: string | null | undefined,
  days: number,
  now: Date = new Date(),
): boolean {
  if (!iso) return false;
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return false;

  const createdDay = startOfDay(created);
  const today = startOfDay(now);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysAgo = Math.round((today.getTime() - createdDay.getTime()) / MS_PER_DAY);

  if (daysAgo < 0) return false; // created "in the future" (clock skew) — never matches
  if (days <= 0) return daysAgo === 0;
  return daysAgo < days;
}

/**
 * True when `iso` matches ANY of the selected presets (union).
 *
 * The presets overlap by design, so selecting "Last 7 days" and "Last 30 days"
 * simply means the last 30 days — the widest selected window wins.
 * An empty selection means "no filter", so everything matches.
 */
export function matchesRelativeDays(
  iso: string | null | undefined,
  selected: string[],
  now: Date = new Date(),
): boolean {
  if (selected.length === 0) return true;
  return selected.some((value) => isWithinLastDays(iso, Number(value), now));
}

// ── REQUESTED AMOUNT column: threshold buckets ─────────────────────

/**
 * Preset thresholds offered by the REQUESTED AMOUNT column's filter, largest
 * first. Same reasoning as the date presets: near-unique amounts make a
 * distinct-value list useless, so the user picks a floor instead.
 */
export const AMOUNT_BUCKETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "10000000", label: "> 10,000,000" },
  { value: "1000000", label: "> 1,000,000" },
  { value: "500000", label: "> 500,000" },
  { value: "100000", label: "> 100,000" },
  { value: "50000", label: "> 50,000" },
  { value: NO_VALUE, label: "No amount" },
];

/**
 * Parses a DRF decimal string into a number, or null when absent/unparseable.
 * Re-exported from lib/money so there is one definition of what an amount is.
 */
export { parseAmount };

/**
 * True when `amount` matches ANY selected bucket (union), so picking
 * "> 500,000" and "> 1,000,000" yields everything above 500,000.
 * An empty selection means "no filter".
 */
export function matchesAmountBuckets(
  amount: string | number | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const value = parseAmount(amount);
  return selected.some((bucket) => {
    if (bucket === NO_VALUE) return value === null;
    return value !== null && value > Number(bucket);
  });
}

// ── DAYS LEFT column: verdict-deadline buckets ─────────────────────

/**
 * Option value for "this case is past its verdict deadline".
 *
 * A word rather than a number because, unlike every other bucket here, it is a
 * direction (< 0) rather than a threshold — writing it as `"-1"` would read as
 * "within -1 days" and invite someone to plug it into the same comparison.
 */
export const DEADLINE_OVERDUE = "overdue";

/**
 * Preset ranges offered by the DAYS LEFT column's filter.
 *
 * The underlying field is `CreditCase.days_until_verdict_due`, a whole number of
 * days that goes NEGATIVE once the deadline has passed. Distinct values would be
 * near-useless as options (one per row again), so the user picks a window; the
 * numeric `value`s are day counts, matching {@link RELATIVE_DAY_OPTIONS}.
 */
export const DEADLINE_BUCKETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: DEADLINE_OVERDUE, label: "Overdue" },
  { value: "0", label: "Due today" },
  { value: "2", label: "Within 2 days" },
  { value: "5", label: "Within 5 days" },
  { value: "10", label: "Within 10 days" },
  { value: NO_VALUE, label: "No deadline" },
];

/**
 * True when `daysLeft` matches ANY selected bucket (union), the same way
 * {@link matchesAmountBuckets} and {@link matchesRelativeDays} behave — so
 * "Overdue" + "Within 2 days" means "either", not "both".
 * An empty selection means "no filter", so everything matches.
 *
 * "Within N days" deliberately excludes overdue cases even though a negative
 * number is arithmetically "less than N": a user asking what is due in the next
 * two days is planning ahead, and quietly folding last week's misses into that
 * answer would hide the fact that they are a separate, more urgent problem.
 * Overdue is its own option for exactly that reason.
 */
export function matchesDeadlineBuckets(
  daysLeft: number | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((bucket) => {
    // A case with no deadline set is reachable only through "No deadline".
    if (bucket === NO_VALUE) return daysLeft === null || daysLeft === undefined;
    if (daysLeft === null || daysLeft === undefined) return false;
    if (bucket === DEADLINE_OVERDUE) return daysLeft < 0;
    // Inclusive: "Within 2 days" covers today (0), tomorrow (1) and the day after (2).
    return daysLeft >= 0 && daysLeft <= Number(bucket);
  });
}

// ── Enum sort ordering ─────────────────────────────────────────────

/**
 * CreditCase.status in pipeline order (as documented on the backend enum),
 * so sorting STATUS walks the workflow instead of going alphabetically.
 */
export const STATUS_SEQUENCE: readonly string[] = [
  "missing_documents",
  "pending_ai_verdict",
  "buro_de_credito_rejected",
  "pending_final_verdict",
  "complete",
];

/** CreditCase.verdict in pipeline order, for the same reason as STATUS_SEQUENCE. */
export const VERDICT_SEQUENCE: readonly string[] = ["pending", "approved", "rejected"];

/**
 * Position of `value` within `sequence`, for use as a sort key. Unknown or
 * blank values return null so {@link compareValues} sinks them to the bottom
 * (rather than silently sorting as position 0 / first).
 */
export function sequenceIndex(
  value: string | null | undefined,
  sequence: readonly string[],
): number | null {
  if (!value) return null;
  const index = sequence.indexOf(value);
  return index === -1 ? null : index;
}
