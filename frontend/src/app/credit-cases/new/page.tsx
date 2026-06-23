"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { createCreditCaseForExistingCustomer } from "@/lib/creditCase";
import { REQUESTED_TERM_DAYS_OPTIONS } from "@/lib/constants";
import type { Customer } from "@/lib/types";

type Phase = "customer" | "creditcase";

export default function NewCreditCasePage() {
  const router = useRouter();
  const { user } = useAuth();

  const organizationUrl = useMemo(() => user?.organizations?.[0] ?? null, [user]);

  // ── Customer search ──────────────────────────────────────────────
  const [allCustomers, setAllCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Linked customer (confirmed) ─────────────────────────────────
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);

  // ── Create-new customer form ─────────────────────────────────────
  const [createMode, setCreateMode] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [rfc, setRfc] = useState("");
  const [legalName, setLegalName] = useState("");
  const [codigoPostal, setCodigoPostal] = useState("");
  const [tipoDeVialidad, setTipoDeVialidad] = useState("");
  const [nombreDeVialidad, setNombreDeVialidad] = useState("");
  const [numeroExterior, setNumeroExterior] = useState("");
  const [numeroInterior, setNumeroInterior] = useState("");
  const [nombreDeLaColonia, setNombreDeLaColonia] = useState("");
  const [nombreDeLaLocalidad, setNombreDeLaLocalidad] = useState("");
  const [nombreDelMunicipio, setNombreDelMunicipio] = useState("");
  const [nombreDeLaEntidadFederativa, setNombreDeLaEntidadFederativa] = useState("");
  const [submittingCustomer, setSubmittingCustomer] = useState(false);
  const [customerSuccess, setCustomerSuccess] = useState<string | null>(null);

  // ── Credit case fields ───────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("customer");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  const [submittingCreditCase, setSubmittingCreditCase] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Load all customers once for search
  useEffect(() => {
    let cancelled = false;
    drfListAll<Customer>({ path: "/customers/" })
      .then((list) => { if (!cancelled) setAllCustomers(list); })
      .catch(() => { if (!cancelled) setAllCustomers([]); });
    return () => { cancelled = true; };
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!allCustomers || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return allCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.rfc ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [allCustomers, search]);

  // ── Handlers ─────────────────────────────────────────────────────

  function handleSelectExisting(customer: Customer) {
    setLinkedCustomer(customer);
    setSearch(customer.name);
    setShowDropdown(false);
    setCreateMode(false);
    setError(null);
    setPhase("creditcase");
  }

  function handleStartCreate() {
    setCreateMode(true);
    setCustomerName(search.trim());
    setShowDropdown(false);
  }

  async function handleCreateCustomer() {
    if (!organizationUrl || !customerName.trim()) return;
    setSubmittingCustomer(true);
    setError(null);
    try {
      const customer = await apiJson<Customer>({
        pathOrUrl: "/customers/",
        method: "POST",
        body: {
          name: customerName.trim(),
          legal_name: legalName.trim() || null,
          rfc: rfc.trim() || null,
          codigo_postal: codigoPostal.trim() || null,
          tipo_de_vialidad: tipoDeVialidad.trim() || null,
          nombre_de_vialidad: nombreDeVialidad.trim() || null,
          numero_exterior: numeroExterior.trim() || null,
          numero_interior: numeroInterior.trim() || null,
          nombre_de_la_colonia: nombreDeLaColonia.trim() || null,
          nombre_de_la_localidad: nombreDeLaLocalidad.trim() || null,
          nombre_del_municipio: nombreDelMunicipio.trim() || null,
          nombre_de_la_entidad_federativa: nombreDeLaEntidadFederativa.trim() || null,
          organization: organizationUrl,
          created_by: user?.url ?? null,
        },
      });
      setLinkedCustomer(customer);
      setCustomerSuccess(`Customer "${customer.name}" created successfully.`);
      setPhase("creditcase");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
    } finally {
      setSubmittingCustomer(false);
    }
  }

  async function handleCreateCreditCase() {
    if (!linkedCustomer) return;
    setSubmittingCreditCase(true);
    setError(null);
    try {
      await createCreditCaseForExistingCustomer({
        customerUrl: linkedCustomer.url,
        requestedAmount: requestedAmount.trim() || undefined,
        currency,
        requestedTermDays: Number(requestedTermDays),
      });
      router.push("/credit-cases");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create credit case");
    } finally {
      setSubmittingCreditCase(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              New credit case
            </h1>
          </div>
          <Link
            href="/credit-cases"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 space-y-6">

          {/* ── Step 1: Customer ──────────────────────────────────── */}
          <section className="rounded-lg border bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                1
              </span>
              <h2 className="text-base font-semibold">Link a customer</h2>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              To create a new credit case, first search for a customer or create a new one.
            </p>

            {linkedCustomer ? (
              /* Confirmed customer */
              <div className="mt-4 flex items-center justify-between rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm">
                <span className="font-medium text-green-900">
                  ✓ {linkedCustomer.name}
                  {linkedCustomer.rfc ? ` · ${linkedCustomer.rfc}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLinkedCustomer(null);
                    setPhase("customer");
                    setSearch("");
                    setCreateMode(false);
                    setCustomerSuccess(null);
                    setError(null);
                  }}
                  className="text-xs text-zinc-600 underline hover:text-zinc-900"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                {/* Search input + dropdown */}
                <div className="relative mt-4">
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCreateMode(false);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Search by name or RFC…"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    autoComplete="off"
                  />

                  {showDropdown && search.trim().length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow-lg">
                      {allCustomers === null ? (
                        <div className="px-4 py-3 text-sm text-zinc-500">
                          Loading customers…
                        </div>
                      ) : filteredCustomers.length > 0 ? (
                        <>
                          {filteredCustomers.map((c) => (
                            <button
                              key={c.url}
                              type="button"
                              onMouseDown={() => handleSelectExisting(c)}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-zinc-50"
                            >
                              <span className="font-medium">{c.name}</span>
                              {c.rfc && (
                                <span className="text-zinc-500">· {c.rfc}</span>
                              )}
                            </button>
                          ))}
                          <div className="border-t" />
                          <button
                            type="button"
                            onMouseDown={handleStartCreate}
                            className="flex w-full items-center px-4 py-2.5 text-left text-sm text-zinc-600 hover:bg-zinc-50"
                          >
                            + Create &ldquo;{search.trim()}&rdquo; as new customer
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onMouseDown={handleStartCreate}
                          className="flex w-full items-center px-4 py-2.5 text-left text-sm hover:bg-zinc-50"
                        >
                          + Create &ldquo;{search.trim()}&rdquo; as new customer
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Create new customer form */}
                {createMode && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void handleCreateCustomer(); }}
                    className="mt-4 space-y-4 rounded-md border bg-zinc-50 p-4"
                  >
                    <div className="text-sm font-semibold text-zinc-800">
                      New customer
                    </div>

                    <label className="block">
                      <div className="text-sm font-medium">
                        Name <span className="text-red-500">*</span>
                      </div>
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                        className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                        placeholder="Customer name"
                      />
                    </label>

                    <div>
                      <button
                        type="button"
                        onClick={() => setShowMoreFields((v) => !v)}
                        className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
                      >
                        {showMoreFields ? "Hide extra fields" : "(show more fields)"}
                      </button>
                    </div>

                    {showMoreFields && (
                      <div className="space-y-4">
                        <label className="block">
                          <div className="text-sm font-medium">RFC</div>
                          <input
                            value={rfc}
                            onChange={(e) => setRfc(e.target.value)}
                            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                            placeholder="RFC"
                          />
                        </label>
                        <label className="block">
                          <div className="text-sm font-medium">Razón social (legal name)</div>
                          <input
                            value={legalName}
                            onChange={(e) => setLegalName(e.target.value)}
                            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                            placeholder="Razón social"
                          />
                        </label>
                        <div className="border-t pt-4">
                          <div className="text-sm font-medium text-zinc-700">
                            Domicilio fiscal
                          </div>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <div className="text-sm font-medium">Código postal</div>
                              <input
                                value={codigoPostal}
                                onChange={(e) => setCodigoPostal(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Tipo de vialidad</div>
                              <input
                                value={tipoDeVialidad}
                                onChange={(e) => setTipoDeVialidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                                placeholder="Calle, avenida, etc."
                              />
                            </label>
                            <label className="block sm:col-span-2">
                              <div className="text-sm font-medium">Nombre de vialidad</div>
                              <input
                                value={nombreDeVialidad}
                                onChange={(e) => setNombreDeVialidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Número exterior</div>
                              <input
                                value={numeroExterior}
                                onChange={(e) => setNumeroExterior(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Número interior</div>
                              <input
                                value={numeroInterior}
                                onChange={(e) => setNumeroInterior(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Colonia</div>
                              <input
                                value={nombreDeLaColonia}
                                onChange={(e) => setNombreDeLaColonia(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Localidad</div>
                              <input
                                value={nombreDeLaLocalidad}
                                onChange={(e) => setNombreDeLaLocalidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Municipio</div>
                              <input
                                value={nombreDelMunicipio}
                                onChange={(e) => setNombreDelMunicipio(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Entidad federativa</div>
                              <input
                                value={nombreDeLaEntidadFederativa}
                                onChange={(e) =>
                                  setNombreDeLaEntidadFederativa(e.target.value)
                                }
                                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={submittingCustomer || !customerName.trim() || !organizationUrl}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        {submittingCustomer ? "Creating…" : "Create customer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMode(false);
                          setSearch("");
                        }}
                        className="text-sm text-zinc-600 hover:text-zinc-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>

          {/* ── Step 2: Credit case ───────────────────────────────── */}
          {phase === "creditcase" && linkedCustomer && (
            <section className="rounded-lg border bg-white p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                  2
                </span>
                <h2 className="text-base font-semibold">Credit case details</h2>
              </div>

              {customerSuccess && (
                <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  {customerSuccess}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); void handleCreateCreditCase(); }} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
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

                {error && phase === "creditcase" && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingCreditCase}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {submittingCreditCase ? "Creating…" : "Create credit case"}
                  </button>
                </div>
              </form>
            </section>
          )}

        </div>
      </RequireAuth>
    </AppShell>
  );
}
