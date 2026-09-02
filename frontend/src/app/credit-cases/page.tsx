"use client";

/**
 * Credit Cases list (`/credit-cases`) — main landing page after login.
 *
 * Loads every credit case for the user's organization plus the customers they point at,
 * then hands both to `CreditCaseTable`, which owns the columns, sorting and filtering
 * (and is shared with the customer detail page so the two tables stay identical).
 * Protected by `RequireAuth`.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CreditCaseTable } from "@/components/CreditCaseTable";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import { listCreditCaseLabels } from "@/lib/labels";
import type { CreditCase, Customer, Label } from "@/lib/types";

export default function CreditCasesPage() {
  const [cases, setCases] = useState<CreditCase[] | null>(null);
  const [customersByUrl, setCustomersByUrl] = useState<Record<string, Customer>>(
    {},
  );
  // The org's custom fields, one extra table column each. Starts empty rather than
  // null: no labels and labels-not-loaded-yet look the same to the table.
  const [labels, setLabels] = useState<Label[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [allCases, orgLabels] = await Promise.all([
          drfListAll<CreditCase>({ path: "/credit-cases/" }),
          // Label columns are an addition to the table, not the table itself, so a
          // failure here is swallowed on purpose: the user loses the custom-field
          // columns and keeps their credit cases, rather than facing a blank
          // dashboard because an optional list endpoint was unhappy.
          listCreditCaseLabels().catch(() => [] as Label[]),
        ]);
        if (cancelled) return;
        setLabels(orgLabels);
        const sorted = [...allCases].sort(
          (a, b) =>
            new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
            new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
        );
        setCases(sorted);

        const uniqueCustomerUrls = Array.from(
          new Set(allCases.map((c) => c.customer?.url).filter(Boolean)),
        ) as string[];
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

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Credit Cases</h1>
            <p className="mt-2 text-sm text-fg-muted">
              Credit cases for your org. Sorting and filtering are applied in the browser
              across all loaded cases.
            </p>
          </div>

          <Link
            href="/credit-cases/new"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            New credit case
          </Link>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <CreditCaseTable
          cases={cases}
          customersByUrl={customersByUrl}
          labels={labels}
        />
      </RequireAuth>
    </AppShell>
  );
}
