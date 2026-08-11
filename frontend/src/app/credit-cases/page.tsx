"use client";

/**
 * Credit Cases list (`/credit-cases`) — main landing page after login.
 *
 * Lists the org's credit cases in a table where every column has its own sort
 * control and every column except ID also has a filter control (see
 * `src/components/TableColumnHeader.tsx`).
 * Fetches all pages from `/credit-cases/` up front and resolves linked
 * customer names, then does all sorting/filtering in the browser. Protected by
 * `RequireAuth`.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { TableColumnHeader } from "@/components/TableColumnHeader";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import {
  AMOUNT_BUCKETS,
  compareValues,
  isWithinLastDays,
  matchesAmountBuckets,
  matchesRelativeDays,
  nextSortState,
  NO_VALUE,
  NO_VALUE_LABEL,
  parseAmount,
  RELATIVE_DAY_OPTIONS,
  sequenceIndex,
  STATUS_SEQUENCE,
  toggleValue,
  VERDICT_SEQUENCE,
  type FilterOption,
  type SortState,
  type SortValue,
} from "@/lib/tableControls";
import type { CreditCase, Customer } from "@/lib/types";

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
};

/**
 * Every column, in table order. Driving the header row, the filter pipeline
 * and the sort pipeline from one list keeps them from drifting apart.
 */
const COLUMNS: ColumnDef[] = [
  {
    id: "id",
    label: "ID",
    // Sort only: an option per distinct id would be one option per row.
    filter: "none",
    sortValue: (cc) => cc.id ?? null,
  },
  {
    id: "customer",
    label: "Customer",
    filter: "values",
    sortValue: (cc, ctx) => ctx.customerName(cc),
    rowValue: (cc, ctx) => ctx.customerName(cc) ?? NO_VALUE,
  },
  {
    id: "status",
    label: "Status",
    filter: "values",
    // Sort by position in the workflow rather than alphabetically.
    sortValue: (cc) => sequenceIndex(cc.status, STATUS_SEQUENCE),
    rowValue: (cc) => cc.status || NO_VALUE,
    optionSortKey: (value) => sequenceIndex(value, STATUS_SEQUENCE),
  },
  {
    id: "verdict",
    label: "Verdict",
    filter: "values",
    sortValue: (cc) => sequenceIndex(cc.verdict, VERDICT_SEQUENCE),
    rowValue: (cc) => cc.verdict || NO_VALUE,
    optionSortKey: (value) => sequenceIndex(value, VERDICT_SEQUENCE),
  },
  {
    id: "amount",
    label: "Requested amount",
    filter: "amountBuckets",
    sortValue: (cc) => parseAmount(cc.requested_amount),
    fieldValue: (cc) => cc.requested_amount,
  },
  {
    id: "term",
    label: "Requested term",
    filter: "values",
    sortValue: (cc) => cc.requested_term_days ?? null,
    rowValue: (cc) =>
      cc.requested_term_days == null ? NO_VALUE : String(cc.requested_term_days),
    optionSortKey: (value) => (value === NO_VALUE ? null : Number(value)),
  },
  {
    id: "created",
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

export default function CreditCasesPage() {
  const [cases, setCases] = useState<CreditCase[] | null>(null);
  const [customersByUrl, setCustomersByUrl] = useState<Record<string, Customer>>(
    {},
  );
  /** Selected filter values per column id. Owned here, never by the dropdown. */
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  /** null = the default order the rows were loaded in (updated_at desc). */
  const [sort, setSort] = useState<SortState>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const allCases = await drfListAll<CreditCase>({ path: "/credit-cases/" });
        if (cancelled) return;
        const sorted = [...allCases].sort(
          (a, b) =>
            new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
            new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
        );
        setCases(sorted);

        const uniqueCustomerUrls = Array.from(
          new Set(allCases.map((c) => c.customer).filter(Boolean)),
        );
        const entries = await Promise.all(
          uniqueCustomerUrls.map(async (url) => {
            try {
              const cust = await apiJson<Customer>({ pathOrUrl: url });
              return [url, cust] as const;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        const map: Record<string, Customer> = {};
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
        }
        setCustomersByUrl(map);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load credit cases";
        setError(msg);
        setCases([]);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ctx = useMemo<ColumnContext>(
    () => ({
      customerName: (cc) => customersByUrl[cc.customer]?.name ?? null,
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
  // back to the load order, with no need to re-fetch or remember anything.
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
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credit Cases</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Credit cases for your org. Sorting and filtering are applied in the browser
              across all loaded cases.
            </p>
          </div>

          <Link
            href="/credit-cases/new"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New credit case
          </Link>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {activeChips.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Filters</span>
            {activeChips.map((chip) => (
              <button
                key={`${chip.columnId}:${chip.value}`}
                type="button"
                onClick={() => handleToggleValue(chip.columnId, chip.value)}
                aria-label={`Remove ${chip.columnLabel} filter ${chip.label}`}
                className="flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
              >
                <span className="text-zinc-500">{chip.columnLabel}:</span>
                <span className="font-medium">{chip.label}</span>
                <span aria-hidden="true" className="text-zinc-400">
                  ✕
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-xs text-zinc-600 underline hover:text-zinc-900"
            >
              Clear all filters
            </button>
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-600">
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
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {!cases ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={COLUMNS.length}>
                    Loading…
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={COLUMNS.length}>
                    {cases.length === 0
                      ? "No credit cases found."
                      : "No credit cases match the current filters."}
                  </td>
                </tr>
              ) : (
                visibleRows.map((cc) => {
                  const cust = customersByUrl[cc.customer];
                  return (
                    <tr key={cc.url} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={`/credit-cases/${cc.id}`}
                          className="text-zinc-900 underline"
                        >
                          #{cc.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {cust ? (
                          // Links to this credit case, not the customer — the
                          // customer name is just a friendlier label for the
                          // row than its id. Customer detail pages are reached
                          // from the Customers nav item.
                          <Link
                            href={`/credit-cases/${cc.id}`}
                            className="font-medium text-zinc-900 underline"
                          >
                            {cust.name}
                          </Link>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{cc.status}</td>
                      <td className="px-4 py-3">{cc.verdict}</td>
                      <td className="px-4 py-3">
                        {formatMoney(cc.requested_amount, cc.currency)}
                      </td>
                      <td className="px-4 py-3">
                        {cc.requested_term_days == null ? "—" : `${cc.requested_term_days}d`}
                      </td>
                      {/* nowrap so the date and time stay on one line rather
                          than wrapping the "PM" onto a second row. */}
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                        {formatDate(cc.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
