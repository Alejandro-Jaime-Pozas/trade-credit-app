"use client";

/**
 * Create credit case (`/credit-cases/new`).
 *
 * User links a new or existing customer, then creates a credit case with
 * initial request fields (amount, currency, term).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CustomerFormFields,
  customerFormValuesToCreateBody,
  emptyCustomerFormValues,
} from "@/components/CustomerFormFields";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  createCreditCaseForExistingCustomer,
  getOrCreateCreditCaseForNewCustomer,
} from "@/lib/creditCase";
import { REQUESTED_TERM_DAYS_OPTIONS } from "@/lib/constants";
import type { Customer } from "@/lib/types";

type CustomerMode = "new" | "existing";

export default function NewCreditCasePage() {
  const router = useRouter();
  const { user } = useAuth();

  const organizationUrl = useMemo(() => user?.organizations?.[0] ?? null, [user]);

  const [mode, setMode] = useState<CustomerMode>("new");
  const [customerForm, setCustomerForm] = useState(emptyCustomerFormValues);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [selectedCustomerUrl, setSelectedCustomerUrl] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [requestedAmount, setRequestedAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [requestedTermDays, setRequestedTermDays] = useState<string>("30");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "existing") return;
    let cancelled = false;
    async function loadCustomers() {
      try {
        const all = await drfListAll<Customer>({ path: "/customers/" });
        if (!cancelled) setCustomers(all);
      } catch (err) {
        if (!cancelled) {
          setCustomers([]);
          setError(err instanceof ApiError ? err.message : "Failed to load customers");
        }
      }
    }
    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.rfc ?? "").toLowerCase().includes(q),
    );
  }, [customers, customerSearch]);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              New credit case
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Link a customer profile and start a trade credit solicitud.
            </p>
          </div>
          <Link
            href="/credit-cases"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Back
          </Link>
        </div>

        {!organizationUrl ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Your user has no linked organization yet. Signup should auto-create one
            based on email domain.
          </div>
        ) : null}

        <form
          className="mt-6 grid gap-6 lg:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!organizationUrl) {
              setError("No organization available for this user.");
              return;
            }

            setSubmitting(true);
            setError(null);

            try {
              let customerUrl: string;

              if (mode === "new") {
                if (!customerForm.name.trim()) {
                  throw new Error("Customer name is required.");
                }
                const customer = await apiJson<Customer>({
                  pathOrUrl: "/customers/",
                  method: "POST",
                  body: customerFormValuesToCreateBody({
                    values: customerForm,
                    organizationUrl,
                    createdByUrl: user?.url,
                  }),
                });
                customerUrl = customer.url;
              } else {
                if (!selectedCustomerUrl) {
                  throw new Error("Select an existing customer.");
                }
                customerUrl = selectedCustomerUrl;
              }

              const creditCaseInput = {
                customerUrl,
                requestedAmount: requestedAmount.trim() || undefined,
                currency,
                requestedTermDays: Number(requestedTermDays),
              };

              const creditCase =
                mode === "new"
                  ? await getOrCreateCreditCaseForNewCustomer(creditCaseInput)
                  : await createCreditCaseForExistingCustomer(creditCaseInput);

              router.push(`/credit-cases/${creditCase.id}`);
            } catch (err) {
              setError(
                err instanceof ApiError
                  ? err.message
                  : err instanceof Error
                    ? err.message
                    : "Failed to create credit case",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <section className="rounded-lg border bg-white p-6 lg:col-span-2">
            <h2 className="text-base font-semibold">Customer</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Create a new customer or link an existing one to this credit case.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("new")}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium",
                  mode === "new"
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "bg-white hover:bg-zinc-50",
                ].join(" ")}
              >
                New customer
              </button>
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium",
                  mode === "existing"
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "bg-white hover:bg-zinc-50",
                ].join(" ")}
              >
                Existing customer
              </button>
            </div>

            <div className="mt-6">
              {mode === "new" ? (
                <CustomerFormFields values={customerForm} onChange={setCustomerForm} />
              ) : (
                <div className="space-y-4">
                  <label className="block">
                    <div className="text-sm font-medium">Search customers</div>
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="Search by name or RFC…"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium">Customer</div>
                    <select
                      value={selectedCustomerUrl}
                      onChange={(e) => setSelectedCustomerUrl(e.target.value)}
                      required
                      className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select a customer…</option>
                      {!customers ? (
                        <option disabled>Loading…</option>
                      ) : filteredCustomers.length === 0 ? (
                        <option disabled>No customers found</option>
                      ) : (
                        filteredCustomers.map((c) => (
                          <option key={c.url} value={c.url}>
                            {c.name}
                            {c.rfc ? ` · ${c.rfc}` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-6 lg:col-span-2">
            <h2 className="text-base font-semibold">Credit request</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Initial fields for the solicitud. You can update these on the credit
              case detail page after creation.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium">Requested amount</div>
                <input
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">Currency</div>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <option value="MXN">MXN</option>
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium">Requested term (days)</div>
                <select
                  value={requestedTermDays}
                  onChange={(e) => setRequestedTermDays(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  {REQUESTED_TERM_DAYS_OPTIONS.map((days) => (
                    <option key={days} value={String(days)}>
                      Net {days}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {error ? (
            <div className="lg:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="lg:col-span-2 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={submitting || !organizationUrl}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create credit case"}
            </button>
          </div>
        </form>
      </RequireAuth>
    </AppShell>
  );
}
