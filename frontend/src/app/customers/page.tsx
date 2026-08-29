"use client";

/**
 * Customer list (`/customers`).
 *
 * Shows all customers for the logged-in user's organization with search.
 * Links to create (`/customers/new`) and detail (`/customers/[id]`) pages.
 */
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Customer } from "@/lib/types";

export default function CustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const all = await drfListAll<Customer>({ path: "/customers/" });
        if (cancelled) return;
        setCustomers(all);
      } catch (err) {
        if (cancelled) return;
        setCustomers([]);
        setError(err instanceof ApiError ? err.message : "Failed to load customers");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, query]);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
            <p className="mt-2 text-sm text-fg-muted">
              Manage customer profiles and contacts.
            </p>
          </div>
          <Link
            href="/customers/new"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            New customer
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-sm rounded-md border bg-surface px-3 py-2 text-sm"
            placeholder="Search customers…"
          />
          <div className="text-xs text-fg-subtle">
            Current user: <span className="font-mono">{user?.email}</span>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-lg border bg-surface">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-surface-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">RFC</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!customers ? (
                <tr>
                  <td className="px-4 py-4 text-fg-muted" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-fg-muted" colSpan={3}>
                    No customers found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.url} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-fg underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{c.rfc || "—"}</td>
                    <td className="px-4 py-3 text-fg-muted">
                      {formatDate(c.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </RequireAuth>
    </AppShell>
  );
}

