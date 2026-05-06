"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Customer, CustomerContact } from "@/lib/types";

export default function NewCustomerPage() {
  const router = useRouter();
  const { user } = useAuth();

  const organizationUrl = useMemo(() => user?.organizations?.[0] ?? null, [user]);

  const [customerName, setCustomerName] = useState("");
  const [rfc, setRfc] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");

  const [contactEmail, setContactEmail] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactRole, setContactRole] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Create a customer and (optionally) a primary contact.
            </p>
          </div>
          <Link
            href="/customers"
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
            setSubmitting(true);
            setError(null);
            try {
              const customer = await apiJson<Customer>({
                pathOrUrl: "/customers/",
                method: "POST",
                body: {
                  name: customerName.trim(),
                  rfc: rfc.trim() || null,
                  nombre_de_vialidad: street.trim() || null,
                  codigo_postal: zip.trim() || null,
                  organization: organizationUrl,
                  created_by: user?.url ?? null,
                },
              });

              if (contactEmail.trim()) {
                if (!organizationUrl) {
                  throw new Error("Cannot create contact without organization.");
                }
                await apiJson<CustomerContact>({
                  pathOrUrl: "/customer-contacts/",
                  method: "POST",
                  body: {
                    email: contactEmail.trim(),
                    first_name: contactFirstName.trim() || null,
                    last_name: contactLastName.trim() || null,
                    role: contactRole.trim() || null,
                    customer: customer.url,
                    organization: organizationUrl,
                    created_by: user?.url ?? null,
                  },
                });
              }

              router.push(`/customers/${customer.id}`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : (err as Error).message);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <section className="rounded-lg border bg-white p-6">
            <h2 className="text-base font-semibold">Customer</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <div className="text-sm font-medium">Name</div>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Nombre comercial"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">RFC (optional)</div>
                <input
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="RFC (persona moral)"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-medium">Street (optional)</div>
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Nombre de vialidad"
                  />
                </label>
                <label className="block">
                  <div className="text-sm font-medium">ZIP (optional)</div>
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    placeholder="Código postal"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-6">
            <h2 className="text-base font-semibold">Primary contact (optional)</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <div className="text-sm font-medium">Email</div>
                <input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  type="email"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="contact@customer.com"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-medium">First name</div>
                  <input
                    value={contactFirstName}
                    onChange={(e) => setContactFirstName(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <div className="text-sm font-medium">Last name</div>
                  <input
                    value={contactLastName}
                    onChange={(e) => setContactLastName(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <div className="text-sm font-medium">Role</div>
                <input
                  value={contactRole}
                  onChange={(e) => setContactRole(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Accounts payable, purchasing, etc"
                />
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
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create customer"}
            </button>
          </div>
        </form>

        <div className="mt-6 rounded-md border bg-white p-4 text-sm text-zinc-600">
          Note: backend credit-case auto-creation isn’t wired yet, and creating credit
          cases via API likely requires authentication (`assigned_to` uses
          `CurrentUserDefault()`).
        </div>
      </RequireAuth>
    </AppShell>
  );
}

