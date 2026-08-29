"use client";

/**
 * The credit cases table, with per-column sorting and filtering.
 *
 * Lives here rather than in the dashboard page because two places show the same list:
 * `/credit-cases` (the whole organization) and the customer detail page (one customer's
 * cases). Sharing the component is what keeps the columns identical between them, which
 * is the point — a user shouldn't have to relearn the table.
 *
 * All filtering and sorting is client-side over the rows handed in. Callers pass rows
 * that are already scoped to the requesting user's organization by the backend.
 */
import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import { StatusWithDot } from "./StatusDot";
import { TableColumnHeader } from "./TableColumnHeader";
import { Money } from "./Money";
import { formatDate } from "@/lib/format";
import {
  AMOUNT_BUCKETS,
  compareValues,
  isWithinLastDays,
  matchesAmountBuckets,
  matchesRelativeDays,
  nextSortState,
  NO_VALUE,
  NO_VALUE_LABEL,
  RELATIVE_DAY_OPTIONS,
  sequenceIndex,
  STATUS_SEQUENCE,
  toggleValue,
  VERDICT_SEQUENCE,
  type FilterOption,
  type SortState,
  type SortValue,
} from "@/lib/tableControls";
import { parseAmount } from "@/lib/money";
import {
  loadColumnWidths,
  saveColumnWidths,
  type ColumnWidths,
} from "@/lib/columnWidths";
import { CREDIT_CASE_STATUS_LABELS } from "@/lib/constants";
import type { CreditCase, Customer } from "@/lib/types";

/** Identifies this table's saved column widths in localStorage. */
const COLUMN_WIDTHS_TABLE_ID = "creditCases";

/** How a column's filter dropdown builds and applies its options. */
type FilterKind =
  /** One option per distinct value found in the rows. */
  | "values"
  /** Fixed "greater than" money thresholds. */
  | "amountBuckets"
  /** Fixed "last N days" presets. */
  | "relativeDays"
  /** Sort-only column — no filter button at all. */
  | "none";

/** Extra data a column needs that doesn't live on the CreditCase itself. */
type ColumnContext = {
  /** Resolved customer display name for a row (customers load separately). */
  customerName: (cc: CreditCase) => string | null;
};

type ColumnDef = {
  id: string;
  label: string;
  filter: FilterKind;
  /** Value this column sorts by. Return null for "missing" (always sorts last). */
  sortValue: (cc: CreditCase, ctx: ColumnContext) => SortValue;
  /** For `values` columns: which option value this row belongs to. */
  rowValue?: (cc: CreditCase, ctx: ColumnContext) => string;
  /** For `amountBuckets` / `relativeDays`: the raw field the presets test against. */
  fieldValue?: (cc: CreditCase) => string | number | null | undefined;
  /** For `values` columns: how to order the option list (defaults to label order). */
  optionSortKey?: (value: string) => SortValue;
  /**
   * Share of the table's width this column gets before the user resizes anything.
   * Roughly proportional to how much text each column holds; they add up to 100.
   */
  widthPercent: number;
};

/**
 * Every column, in table order. Driving the header row, the filter pipeline
 * and the sort pipeline from one list keeps them from drifting apart.
 */
const COLUMNS: ColumnDef[] = [
  {
    id: "id",
    widthPercent: 6,
    label: "ID",
    // Sort only: an option per distinct id would be one option per row.
    filter: "none",
    sortValue: (cc) => cc.id ?? null,
  },
  {
    id: "customer",
    widthPercent: 22,
    label: "Customer",
    filter: "values",
    sortValue: (cc, ctx) => ctx.customerName(cc),
    rowValue: (cc, ctx) => ctx.customerName(cc) ?? NO_VALUE,
  },
  {
    id: "status",
    widthPercent: 16,
    label: "Status",
    filter: "values",
    // Sort by position in the workflow rather than alphabetically.
    sortValue: (cc) => sequenceIndex(cc.status, STATUS_SEQUENCE),
    rowValue: (cc) => cc.status || NO_VALUE,
    optionSortKey: (value) => sequenceIndex(value, STATUS_SEQUENCE),
  },
  {
    id: "verdict",
    widthPercent: 10,
    label: "Verdict",
    filter: "values",
    sortValue: (cc) => sequenceIndex(cc.verdict, VERDICT_SEQUENCE),
    rowValue: (cc) => cc.verdict || NO_VALUE,
    optionSortKey: (value) => sequenceIndex(value, VERDICT_SEQUENCE),
  },
  {
    id: "amount",
    widthPercent: 15,
    label: "Requested amount",
    filter: "amountBuckets",
    sortValue: (cc) => parseAmount(cc.requested_amount),
    fieldValue: (cc) => cc.requested_amount,
  },
  {
    id: "term",
    widthPercent: 11,
    label: "Requested term",
    filter: "values",
    sortValue: (cc) => cc.requested_term_days ?? null,
    rowValue: (cc) =>
      cc.requested_term_days == null ? NO_VALUE : String(cc.requested_term_days),
    optionSortKey: (value) => (value === NO_VALUE ? null : Number(value)),
  },
  {
    id: "created",
    widthPercent: 20,
    label: "Created",
    filter: "relativeDays",
    sortValue: (cc) => {
      const t = new Date(cc.created_at ?? "").getTime();
      return Number.isNaN(t) ? null : t;
    },
    fieldValue: (cc) => cc.created_at,
  },
];

/** Human-readable text for a selected option value (used by the filter chips). */
function optionLabel(column: ColumnDef, value: string): string {
  if (value === NO_VALUE) {
    return column.filter === "amountBuckets" ? "No amount" : NO_VALUE_LABEL;
  }
  if (column.filter === "amountBuckets") {
    return AMOUNT_BUCKETS.find((b) => b.value === value)?.label ?? value;
  }
  if (column.filter === "relativeDays") {
    return RELATIVE_DAY_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
  if (column.id === "term") return `${value} days`;
  if (column.id === "status") return CREDIT_CASE_STATUS_LABELS[value] ?? value;
  return value;
}

/** Does one row pass one column's active filter? An empty selection passes everything. */
function rowMatchesColumn(
  column: ColumnDef,
  cc: CreditCase,
  selected: string[],
  ctx: ColumnContext,
  now: Date,
): boolean {
  if (column.filter === "none" || selected.length === 0) return true;
  if (column.filter === "amountBuckets") {
    return matchesAmountBuckets(column.fieldValue?.(cc), selected);
  }
  if (column.filter === "relativeDays") {
    return matchesRelativeDays(
      column.fieldValue?.(cc) as string | null | undefined,
      selected,
      now,
    );
  }
  return selected.includes(column.rowValue!(cc, ctx));
}

/** Builds a column's dropdown options, with a match count for each. */
function buildOptions(
  column: ColumnDef,
  rows: CreditCase[],
  ctx: ColumnContext,
  now: Date,
): FilterOption[] {
  if (column.filter === "none") return [];
  if (column.filter === "amountBuckets") {
    return AMOUNT_BUCKETS.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: rows.filter((r) => matchesAmountBuckets(column.fieldValue?.(r), [bucket.value]))
        .length,
    }));
  }

  if (column.filter === "relativeDays") {
    return RELATIVE_DAY_OPTIONS.map((preset) => ({
      value: preset.value,
      label: preset.label,
      count: rows.filter((r) =>
        isWithinLastDays(
          column.fieldValue?.(r) as string | null | undefined,
          Number(preset.value),
          now,
        ),
      ).length,
    }));
  }

  // `values`: one option per distinct value present in the rows.
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = column.rowValue!(row, ctx);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: optionLabel(column, value), count }))
    .sort((a, b) => {
      // The "missing value" option is always last, whatever the column's order.
      if (a.value === NO_VALUE) return 1;
      if (b.value === NO_VALUE) return -1;
      const key = column.optionSortKey;
      return key
        ? compareValues(key(a.value), key(b.value), "asc")
        : compareValues(a.label, b.label, "asc");
    });
}

export function CreditCaseTable(props: {
  /** Rows to show, in their default order. `null` renders the loading state. */
  cases: CreditCase[] | null;
  /** Customer records keyed by their API url, for resolving names. */
  customersByUrl: Record<string, Customer>;
  /** Shown when there are no rows at all (as opposed to none matching a filter). */
  emptyMessage?: string;
}) {
  const { cases, customersByUrl, emptyMessage = "No credit cases found." } = props;

  /**
   * Column widths the user dragged, remembered as their own default.
   *
   * Read lazily on first render rather than in an effect: an effect would paint the
   * table at its default widths first and then snap, and `react-hooks/set-state-in-effect`
   * rejects the synchronous setState that would be needed to avoid that.
   */
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() =>
    loadColumnWidths(COLUMN_WIDTHS_TABLE_ID),
  );

  /**
   * The latest widths, readable from the drag's own event listeners.
   *
   * Those listeners are created once at pointer-down, so they close over that render's
   * state — reading `columnWidths` directly when the drag ends would persist the width
   * from before the drag rather than after it.
   */
  const latestWidths = useRef(columnWidths);

  /** Live during a drag; persisted once on release so localStorage isn't hit per pixel. */
  function handleResize(columnId: string, width: number) {
    const next = { ...latestWidths.current };
    // 0 is the double-click reset: forget the width and let the table size it again.
    if (width <= 0) {
      delete next[columnId];
    } else {
      next[columnId] = width;
    }
    latestWidths.current = next;
    setColumnWidths(next);
  }

  function handleResizeEnd() {
    saveColumnWidths(COLUMN_WIDTHS_TABLE_ID, latestWidths.current);
  }

  /** Selected filter values per column id. Owned here, never by the dropdown. */
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  /** null = the default order the rows were handed to us in. */
  const [sort, setSort] = useState<SortState>(null);

  const ctx = useMemo<ColumnContext>(
    () => ({
      customerName: (cc) => customersByUrl[cc.customer?.url ?? ""]?.name ?? null,
    }),
    [customersByUrl],
  );

  // Rows passing every active column filter (AND across columns, OR within one).
  const filteredRows = useMemo(() => {
    if (!cases) return [];
    const now = new Date();
    return cases.filter((cc) =>
      COLUMNS.every((col) => rowMatchesColumn(col, cc, filters[col.id] ?? [], ctx, now)),
    );
  }, [cases, filters, ctx]);

  // Each column's options, counted against rows passing all the OTHER columns'
  // filters — so a count never promises rows another filter has already hidden.
  const optionsByColumn = useMemo(() => {
    const now = new Date();
    const result: Record<string, FilterOption[]> = {};
    const rows = cases ?? [];
    for (const col of COLUMNS) {
      const base = rows.filter((cc) =>
        COLUMNS.every(
          (other) =>
            other.id === col.id ||
            rowMatchesColumn(other, cc, filters[other.id] ?? [], ctx, now),
        ),
      );
      result[col.id] = buildOptions(col, base, ctx, now);
    }
    return result;
  }, [cases, filters, ctx]);

  // Applying the sort last means clearing it (the third click) simply falls
  // back to the incoming order, with no need to re-fetch or remember anything.
  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = COLUMNS.find((c) => c.id === sort.columnId);
    if (!column) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      compareValues(column.sortValue(a, ctx), column.sortValue(b, ctx), sort.direction),
    );
  }, [filteredRows, sort, ctx]);

  const activeChips = useMemo(
    () =>
      COLUMNS.flatMap((col) =>
        (filters[col.id] ?? []).map((value) => ({
          columnId: col.id,
          columnLabel: col.label,
          value,
          label: optionLabel(col, value),
        })),
      ),
    [filters],
  );

  function handleToggleValue(columnId: string, value: string) {
    setFilters((prev) => ({
      ...prev,
      [columnId]: toggleValue(prev[columnId] ?? [], value),
    }));
  }

  function handleClearColumn(columnId: string) {
    setFilters((prev) => ({ ...prev, [columnId]: [] }));
  }

  return (
    <>
      {activeChips.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-fg-subtle">Filters</span>
          {activeChips.map((chip) => (
            <button
              key={`${chip.columnId}:${chip.value}`}
              type="button"
              onClick={() => handleToggleValue(chip.columnId, chip.value)}
              aria-label={`Remove ${chip.columnLabel} filter ${chip.label}`}
              className="flex items-center gap-1 rounded-full border bg-surface px-2.5 py-1 text-xs text-fg-secondary hover:bg-surface-subtle"
            >
              <span className="text-fg-subtle">{chip.columnLabel}:</span>
              <span className="font-medium">{chip.label}</span>
              <span aria-hidden="true" className="text-fg-faint">
                ✕
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFilters({})}
            className="text-xs text-fg-muted underline hover:text-fg"
          >
            Clear all filters
          </button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-surface-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              {COLUMNS.map((col) => (
                <TableColumnHeader
                  key={col.id}
                  columnId={col.id}
                  label={col.label}
                  sortDirection={sort?.columnId === col.id ? sort.direction : null}
                  onToggleSort={() => setSort((prev) => nextSortState(prev, col.id))}
                  // Leaving options undefined renders a sort-only header.
                  options={
                    col.filter === "none" ? undefined : (optionsByColumn[col.id] ?? [])
                  }
                  selected={filters[col.id] ?? []}
                  onToggleValue={(value) => handleToggleValue(col.id, value)}
                  onClearColumn={() => handleClearColumn(col.id)}
                  width={columnWidths[col.id]}
                  defaultWidthPercent={col.widthPercent}
                  onResize={(width) => handleResize(col.id, width)}
                  onResizeEnd={handleResizeEnd}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {!cases ? (
              <tr>
                <td className="px-4 py-4 text-fg-muted" colSpan={COLUMNS.length}>
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-fg-muted" colSpan={COLUMNS.length}>
                  {cases.length === 0
                    ? emptyMessage
                    : "No credit cases match the current filters."}
                </td>
              </tr>
            ) : (
              visibleRows.map((cc) => {
                const cust = customersByUrl[cc.customer?.url ?? ""];
                return (
                  <tr key={cc.url} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/credit-cases/${cc.id}`}
                        className="text-fg underline"
                      >
                        #{cc.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {cust ? (
                        // Links to this credit case, not the customer — the customer
                        // name is just a friendlier label for the row than its id.
                        <Link
                          href={`/credit-cases/${cc.id}`}
                          className="font-medium text-fg underline"
                        >
                          {cust.name}
                        </Link>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusWithDot status={cc.status} />
                    </td>
                    <td className="px-4 py-3 capitalize">{cc.verdict}</td>
                    <td className="px-4 py-3">
                      <Money value={cc.requested_amount} currency={cc.currency} />
                    </td>
                    <td className="px-4 py-3">
                      {cc.requested_term_days == null ? "—" : `${cc.requested_term_days}d`}
                    </td>
                    {/* nowrap so the date and time stay on one line rather than
                        wrapping the "PM" onto a second row. */}
                    <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                      {formatDate(cc.created_at)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
