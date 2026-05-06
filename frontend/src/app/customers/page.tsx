"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
            <p className="mt-2 text-sm text-zinc-600">
              Manage customer profiles and contacts.
            </p>
          </div>
          <Link
            href="/customers/new"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New customer
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full max-w-sm rounded-md border bg-white px-3 py-2 text-sm"
            placeholder="Search customers…"
          />
          <div className="text-xs text-zinc-500">
            Current user: <span className="font-mono">{user?.email}</span>
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
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">RFC</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!customers ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={3}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-600" colSpan={3}>
                    No customers found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.url} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-zinc-900 underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{c.rfc || "—"}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {new Date(c.created_at).toLocaleString()}
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

