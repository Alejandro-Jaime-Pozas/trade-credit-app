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
import { ColumnSettings } from "./ColumnSettings";
import { StatusWithDot } from "./StatusDot";
import { TableColumnHeader } from "./TableColumnHeader";
import { Money } from "./Money";
import { formatDate } from "@/lib/format";
import {
  AMOUNT_BUCKETS,
  compareValues,
  DEADLINE_BUCKETS,
  isWithinLastDays,
  matchesAmountBuckets,
  matchesDeadlineBuckets,
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
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";
import { customFieldValue, labelColumnId } from "@/lib/labels";
import { parseAmount } from "@/lib/money";
import {
  loadColumnWidths,
  saveColumnWidths,
  type ColumnWidths,
} from "@/lib/columnWidths";
import {
  applyOrder,
  loadLayout,
  moveItem,
  nudgeItem,
  saveLayout,
  toggleHidden,
  type LayoutPrefs,
} from "@/lib/layoutPrefs";
import { CREDIT_CASE_STATUS_LABELS } from "@/lib/constants";
import type { CreditCase, Customer, Label } from "@/lib/types";

/** Identifies this table's saved column widths in localStorage. */
const COLUMN_WIDTHS_TABLE_ID = "creditCases";

/** Identifies this table's saved column order and hidden columns. */
const COLUMN_LAYOUT_ID = "creditCasesColumns";

/** Filename prefix for the CSV export, dated by `csvFilename`. */
const CSV_FILENAME_PREFIX = "credit-cases";

/**
 * Stable stand-in for "this caller has no labels".
 *
 * A `= []` default in the destructuring would build a fresh array on every render,
 * which would make the `useMemo` that builds the columns miss its cache every time.
 */
const NO_LABELS: Label[] = [];

/** How a column's filter dropdown builds and applies its options. */
type FilterKind =
  /** One option per distinct value found in the rows. */
  | "values"
  /** Fixed "greater than" money thresholds. */
  | "amountBuckets"
  /** Fixed "last N days" presets. */
  | "relativeDays"
  /** Fixed verdict-deadline windows (overdue / due today / within N days). */
  | "deadlineBuckets"
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
  /**
   * This column's cell for one row.
   *
   * Every column renders its own cell so `<thead>` and `<tbody>` can be driven from
   * the same array. Hand-written `<td>`s in a fixed order used to work, but the
   * column list is now dynamic (label columns depend on the org), and a fixed body
   * would silently put values under the wrong headings the moment it changed.
   */
  renderCell: (cc: CreditCase, ctx: ColumnContext) => React.ReactNode;
  /**
   * Plain text for this column in the CSV export. Defaults to `sortValue`, which is
   * right for the columns whose sort key already IS the value (ids, amounts, days).
   * Columns that sort by something internal — a pipeline position, a timestamp —
   * override it so the file reads the way the table does.
   */
  csvValue?: (cc: CreditCase, ctx: ColumnContext) => string | number | null;
  /** Extra classes for this column's `<td>`, on top of the shared cell padding. */
  cellClassName?: string;
  /** For `values` columns: which option value this row belongs to. */
  rowValue?: (cc: CreditCase, ctx: ColumnContext) => string;
  /** For `amountBuckets` / `relativeDays` / `deadlineBuckets`: the raw field the presets test against. */
  fieldValue?: (cc: CreditCase) => string | number | null | undefined;
  /** For `values` columns: how to order the option list (defaults to label order). */
  optionSortKey?: (value: string) => SortValue;
  /**
   * Share of the table's width this column gets before the user resizes anything.
   * Roughly proportional to how much text each column holds; normalised to 100 by
   * {@link buildColumns} once the org's label columns have been appended.
   */
  widthPercent: number;
};

/**
 * How a `days_until_verdict_due` number reads in the table.
 *
 * The raw field goes negative once a deadline has passed, and "-3" in a column called
 * "Days left" is a small puzzle for the reader — it takes a beat to work out whether
 * it means three days late or three days early. Spelling it out removes the beat.
 */
export function deadlineText(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return NO_VALUE_LABEL;
  if (daysLeft < 0) {
    const late = Math.abs(daysLeft);
    return `${late} ${late === 1 ? "day" : "days"} late`;
  }
  // Zero is the deadline itself, not "no time left" — a case due today is still on time.
  if (daysLeft === 0) return "Today";
  return `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`;
}

/**
 * Every column, in table order, for an organization with these labels.
 *
 * A function rather than a constant because the column list is no longer fixed: each
 * custom field ("label") the org defines becomes a column of its own. Driving the
 * header row, the body, the filter pipeline, the sort pipeline and the CSV export
 * from this one list is what keeps them from drifting apart.
 */
export function buildColumns(labels: Label[]): ColumnDef[] {
  const columns: ColumnDef[] = [
    {
      id: "id",
      widthPercent: 5,
      label: "ID",
      // Sort only: an option per distinct id would be one option per row.
      filter: "none",
      sortValue: (cc) => cc.id ?? null,
      cellClassName: "font-medium",
      renderCell: (cc) => (
        <Link href={`/credit-cases/${cc.id}`} className="text-fg underline">
          #{cc.id}
        </Link>
      ),
    },
    {
      id: "customer",
      widthPercent: 18,
      label: "Customer",
      filter: "values",
      sortValue: (cc, ctx) => ctx.customerName(cc),
      rowValue: (cc, ctx) => ctx.customerName(cc) ?? NO_VALUE,
      renderCell: (cc, ctx) => {
        const name = ctx.customerName(cc);
        return name ? (
          // Links to this credit case, not the customer — the customer name is
          // just a friendlier label for the row than its id.
          <Link
            href={`/credit-cases/${cc.id}`}
            className="font-medium text-fg underline"
          >
            {name}
          </Link>
        ) : (
          <span className="text-fg-muted">{NO_VALUE_LABEL}</span>
        );
      },
    },
    {
      id: "status",
      widthPercent: 14,
      label: "Status",
      filter: "values",
      // Sort by position in the workflow rather than alphabetically.
      sortValue: (cc) => sequenceIndex(cc.status, STATUS_SEQUENCE),
      rowValue: (cc) => cc.status || NO_VALUE,
      optionSortKey: (value) => sequenceIndex(value, STATUS_SEQUENCE),
      // The sort key is a pipeline position, so the CSV needs the readable name.
      csvValue: (cc) =>
        cc.status ? (CREDIT_CASE_STATUS_LABELS[cc.status] ?? cc.status) : null,
      renderCell: (cc) => <StatusWithDot status={cc.status} />,
    },
    {
      id: "verdict",
      widthPercent: 8,
      label: "Verdict",
      filter: "values",
      sortValue: (cc) => sequenceIndex(cc.verdict, VERDICT_SEQUENCE),
      rowValue: (cc) => cc.verdict || NO_VALUE,
      optionSortKey: (value) => sequenceIndex(value, VERDICT_SEQUENCE),
      csvValue: (cc) => cc.verdict || null,
      cellClassName: "capitalize",
      renderCell: (cc) => cc.verdict,
    },
    {
      id: "amount",
      widthPercent: 13,
      label: "Requested amount",
      filter: "amountBuckets",
      sortValue: (cc) => parseAmount(cc.requested_amount),
      fieldValue: (cc) => cc.requested_amount,
      renderCell: (cc) => <Money value={cc.requested_amount} currency={cc.currency} />,
    },
    {
      id: "term",
      widthPercent: 9,
      label: "Requested term",
      filter: "values",
      sortValue: (cc) => cc.requested_term_days ?? null,
      rowValue: (cc) =>
        cc.requested_term_days == null ? NO_VALUE : String(cc.requested_term_days),
      optionSortKey: (value) => (value === NO_VALUE ? null : Number(value)),
      renderCell: (cc) =>
        cc.requested_term_days == null ? NO_VALUE_LABEL : `${cc.requested_term_days}d`,
    },
    {
      id: "created",
      widthPercent: 15,
      label: "Created",
      filter: "relativeDays",
      sortValue: (cc) => {
        const t = new Date(cc.created_at ?? "").getTime();
        return Number.isNaN(t) ? null : t;
      },
      fieldValue: (cc) => cc.created_at,
      // The sort key is a millisecond timestamp; export the date the user sees.
      csvValue: (cc) => formatDate(cc.created_at),
      // nowrap so the date and time stay on one line rather than wrapping the
      // "PM" onto a second row.
      cellClassName: "whitespace-nowrap text-fg-muted",
      renderCell: (cc) => formatDate(cc.created_at),
    },
    {
      id: "daysOpen",
      widthPercent: 8,
      label: "Days open",
      // Sort only: "how long has this been sitting here" is a ranking question, and
      // the deadline column below already covers picking out a specific window.
      filter: "none",
      sortValue: (cc) => cc.days_since_created ?? null,
      cellClassName: "text-fg-muted",
      renderCell: (cc) =>
        cc.days_since_created == null ? NO_VALUE_LABEL : `${cc.days_since_created}d`,
    },
    {
      id: "daysLeft",
      widthPercent: 10,
      label: "Days left",
      filter: "deadlineBuckets",
      // Sorts by the raw signed number, so the most overdue case leads ascending.
      sortValue: (cc) => cc.days_until_verdict_due ?? null,
      fieldValue: (cc) => cc.days_until_verdict_due,
      // Exported as the signed number rather than the cell's wording: a spreadsheet
      // reader wants to sort and total this column, which "3 days late" can't do.
      csvValue: (cc) => cc.days_until_verdict_due ?? null,
      renderCell: (cc) => (
        <span
          className={cc.is_verdict_overdue ? "font-medium text-danger" : undefined}
        >
          {deadlineText(cc.days_until_verdict_due)}
        </span>
      ),
    },
    // One column per custom field the org has defined. Values arrive already
    // flattened onto the case as `custom_fields`, so a label really is just
    // another column — no extra fetch per row.
    ...labels.map((label) => ({
      id: labelColumnId(label),
      widthPercent: 10,
      label: label.name,
      filter: "values" as const,
      sortValue: (cc: CreditCase) => customFieldValue(cc.custom_fields, label.name),
      // Unset values fall into the shared NO_VALUE bucket, so they filter as "—"
      // and sort last exactly like every other missing value in the table.
      rowValue: (cc: CreditCase) =>
        customFieldValue(cc.custom_fields, label.name) ?? NO_VALUE,
      renderCell: (cc: CreditCase) =>
        customFieldValue(cc.custom_fields, label.name) ?? (
          <span className="text-fg-muted">{NO_VALUE_LABEL}</span>
        ),
    })),
  ];

  // Rescale so the shares still add up to 100 however many label columns there are.
  // Left alone, five labels would push the total to 150% and squeeze the built-in
  // columns by an amount nobody chose; scaling shrinks every column proportionally.
  const total = columns.reduce((sum, col) => sum + col.widthPercent, 0);
  if (total <= 0) return columns;
  return columns.map((col) => ({
    ...col,
    widthPercent: Math.round((col.widthPercent / total) * 1000) / 10,
  }));
}

/** Human-readable text for a selected option value (used by the filter chips). */
function optionLabel(column: ColumnDef, value: string): string {
  if (value === NO_VALUE) {
    if (column.filter === "amountBuckets") return "No amount";
    if (column.filter === "deadlineBuckets") return "No deadline";
    return NO_VALUE_LABEL;
  }
  if (column.filter === "amountBuckets") {
    return AMOUNT_BUCKETS.find((b) => b.value === value)?.label ?? value;
  }
  if (column.filter === "relativeDays") {
    return RELATIVE_DAY_OPTIONS.find((o) => o.value === value)?.label ?? value;
  }
  if (column.filter === "deadlineBuckets") {
    return DEADLINE_BUCKETS.find((b) => b.value === value)?.label ?? value;
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
  if (column.filter === "deadlineBuckets") {
    return matchesDeadlineBuckets(
      column.fieldValue?.(cc) as number | null | undefined,
      selected,
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

  if (column.filter === "deadlineBuckets") {
    return DEADLINE_BUCKETS.map((bucket) => ({
      value: bucket.value,
      label: bucket.label,
      count: rows.filter((r) =>
        matchesDeadlineBuckets(column.fieldValue?.(r) as number | null | undefined, [
          bucket.value,
        ]),
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
  /**
   * The org's credit case custom fields, one extra column each. Optional so a caller
   * that hasn't loaded them (or failed to) still gets a working table.
   */
  labels?: Label[];
  /** Shown when there are no rows at all (as opposed to none matching a filter). */
  emptyMessage?: string;
}) {
  const {
    cases,
    customersByUrl,
    labels = NO_LABELS,
    emptyMessage = "No credit cases found.",
  } = props;

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

  /**
   * The column order and hidden columns this user chose, read on first render for the
   * same reason the widths are — an effect would paint the default arrangement first
   * and then snap to theirs.
   */
  const [layout, setLayout] = useState<LayoutPrefs>(() => loadLayout(COLUMN_LAYOUT_ID));

  /** Persist on every change: unlike a resize drag, these are one click at a time. */
  function updateLayout(next: LayoutPrefs) {
    setLayout(next);
    saveLayout(COLUMN_LAYOUT_ID, next);
  }

  // Rebuilt only when the org's labels change — every column carries closures, so
  // rebuilding per render would hand the header cells new props each time.
  const allColumns = useMemo(() => buildColumns(labels), [labels]);

  /**
   * Every column in the user's order, hidden ones included.
   *
   * A custom field created since they last rearranged anything lands at the end and is
   * visible, which is what makes "create a field, it appears as a new column" true even
   * for someone with a saved arrangement — see `applyOrder`.
   */
  const orderedColumns = useMemo(
    () => applyOrder(allColumns, layout.order),
    [allColumns, layout.order],
  );

  /**
   * What actually gets rendered.
   *
   * Filters and sorts deliberately run over the VISIBLE columns only: a filter the user
   * can no longer see, on a column they hid, would quietly remove rows with nothing on
   * screen to explain why.
   */
  const columns = useMemo(
    () => orderedColumns.filter((col) => !layout.hidden.includes(col.id)),
    [orderedColumns, layout.hidden],
  );

  const columnSettingsEntries = useMemo(
    () =>
      orderedColumns.map((col) => ({
        id: col.id,
        label: col.label,
        visible: !layout.hidden.includes(col.id),
      })),
    [orderedColumns, layout.hidden],
  );

  /** Column ids in their current rendered order, which is what a move is relative to. */
  const orderedIds = useMemo(
    () => orderedColumns.map((col) => col.id),
    [orderedColumns],
  );

  /** Set while a heading is being dragged, so every other heading shows it can take it. */
  const [draggingColumn, setDraggingColumn] = useState(false);

  function handleReorder(draggedId: string, targetId: string) {
    setDraggingColumn(false);
    updateLayout({ ...layout, order: moveItem(orderedIds, draggedId, targetId) });
  }

  function handleNudge(columnId: string, delta: -1 | 1) {
    updateLayout({ ...layout, order: nudgeItem(orderedIds, columnId, delta) });
  }

  function handleToggleVisible(columnId: string) {
    updateLayout({ ...layout, hidden: toggleHidden(layout.hidden, columnId) });
  }

  function handleResetLayout() {
    updateLayout({ order: [], hidden: [] });
  }

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
      columns.every((col) => rowMatchesColumn(col, cc, filters[col.id] ?? [], ctx, now)),
    );
  }, [cases, columns, filters, ctx]);

  // Each column's options, counted against rows passing all the OTHER columns'
  // filters — so a count never promises rows another filter has already hidden.
  const optionsByColumn = useMemo(() => {
    const now = new Date();
    const result: Record<string, FilterOption[]> = {};
    const rows = cases ?? [];
    for (const col of columns) {
      const base = rows.filter((cc) =>
        columns.every(
          (other) =>
            other.id === col.id ||
            rowMatchesColumn(other, cc, filters[other.id] ?? [], ctx, now),
        ),
      );
      result[col.id] = buildOptions(col, base, ctx, now);
    }
    return result;
  }, [cases, columns, filters, ctx]);

  // Applying the sort last means clearing it (the third click) simply falls
  // back to the incoming order, with no need to re-fetch or remember anything.
  const visibleRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      compareValues(column.sortValue(a, ctx), column.sortValue(b, ctx), sort.direction),
    );
  }, [filteredRows, columns, sort, ctx]);

  const activeChips = useMemo(
    () =>
      columns.flatMap((col) =>
        (filters[col.id] ?? []).map((value) => ({
          columnId: col.id,
          columnLabel: col.label,
          value,
          label: optionLabel(col, value),
        })),
      ),
    [columns, filters],
  );

  // The CSV's columns are built from the same list as the table's, so the file can
  // never offer a different set of columns than the screen — label columns included.
  const csvColumns = useMemo<CsvColumn<CreditCase>[]>(
    () =>
      columns.map((col) => ({
        header: col.label,
        value: (cc: CreditCase) =>
          col.csvValue ? col.csvValue(cc, ctx) : col.sortValue(cc, ctx),
      })),
    [columns, ctx],
  );

  function handleExportCsv() {
    // `visibleRows`, NOT `cases`: the export is the rows the user is actually looking
    // at, after their filters and their sort. That is the entire point of the feature
    // — someone who filtered down to "overdue in Monterrey" wants that list in Excel,
    // not the whole org's cases back again.
    downloadCsv(csvFilename(CSV_FILENAME_PREFIX), toCsv(visibleRows, csvColumns));
  }

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
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {activeChips.length > 0 && (
          <>
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
          </>
        )}

        {/* Pushed to the far end so they read as actions on the list rather than as
            more filter chips. */}
        <div className="ml-auto flex items-center gap-2">
          <ColumnSettings
            entries={columnSettingsEntries}
            onToggleVisible={handleToggleVisible}
            onMove={handleNudge}
            onReset={handleResetLayout}
          />
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleRows.length === 0}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-surface-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
            {/* Captured on the row rather than per heading: `dragstart` bubbles, and one
                listener here is what lets every OTHER heading know a drag is in flight. */}
            <tr
              onDragStart={() => setDraggingColumn(true)}
              onDragEnd={() => setDraggingColumn(false)}
            >
              {columns.map((col) => (
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
                  onReorder={(draggedId) => handleReorder(draggedId, col.id)}
                  dragging={draggingColumn}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {!cases ? (
              <tr>
                <td className="px-4 py-4 text-fg-muted" colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-fg-muted" colSpan={columns.length}>
                  {cases.length === 0
                    ? emptyMessage
                    : "No credit cases match the current filters."}
                </td>
              </tr>
            ) : (
              visibleRows.map((cc) => (
                <tr key={cc.url} className="hover:bg-surface-subtle">
                  {/* Same array as the header row above, so a cell can never end up
                      under the wrong heading. */}
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={`px-4 py-3${col.cellClassName ? ` ${col.cellClassName}` : ""}`}
                    >
                      {col.renderCell(cc, ctx)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
