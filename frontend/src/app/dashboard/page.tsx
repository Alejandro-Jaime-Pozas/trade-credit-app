"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import type { CreditCase, Customer } from "@/lib/types";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function DashboardPage() {
  const [cases, setCases] = useState<CreditCase[] | null>(null);
  const [customersByUrl, setCustomersByUrl] = useState<Record<string, Customer>>(
    {},
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const allCases = await drfListAll<CreditCase>({ path: "/credit-cases/" });
        if (cancelled) return;
        setCases(allCases);

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

  const filtered = useMemo(() => {
    if (!cases) return [];
    if (statusFilter === "all") return cases;
    return cases.filter((c) => c.status === statusFilter);
  }, [cases, statusFilter]);

  const uniqueStatuses = useMemo(() => {
    if (!cases) return [];
    return Array.from(new Set(cases.map((c) => c.status))).sort();
  }, [cases]);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Credit cases for your org (dev-mode: no server-side filtering yet).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border bg-white px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Verdict</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!cases ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={6}>
                    No credit cases found.
                  </td>
                </tr>
              ) : (
                filtered.map((cc) => {
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
                          <Link
                            href={`/customers/${cust.id}`}
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
                        {cc.currency} {cc.requested_amount} / {cc.requested_term_days}d
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(cc.created_at)}</td>
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

