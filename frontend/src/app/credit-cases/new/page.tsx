"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiJson, ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { createCreditCaseForExistingCustomer } from "@/lib/creditCase";
import { CURRENCY_OPTIONS, REQUESTED_TERM_DAYS_OPTIONS } from "@/lib/constants";
import { FileTypeChooser, type FileTypeChooserSelection } from "@/components/FileTypeChooser";
import { ImpactWarning } from "@/components/ImpactWarning";
import { MoneyInput } from "@/components/MoneyInput";
import {
  applyTemplateToCases,
  createDefaultTemplate,
  getDefaultTemplate,
  getTemplateImpact,
  listFileTypes,
  setCreditCaseRequirements,
  templateFileTypeIds,
  updateTemplateItems,
  type TemplateImpactEntry,
} from "@/lib/fileTypes";
import { useTransientMessage } from "@/lib/useTransientMessage";
import type { CreditCase, Customer, FileType, RequirementTemplate } from "@/lib/types";

// The wizard ends on "requirements": the credit case is created first, then the user
// says which documents it needs. An organization that has never set a default template
// is prompted to create one here, which is the app's onboarding moment for requirements.
type Phase = "customer" | "creditcase" | "requirements";

// A row in the customer search dropdown: either an existing customer or the
// trailing "create new customer" action.
type CustomerDropdownOption =
  | { kind: "customer"; customer: Customer }
  | { kind: "create" };

export default function NewCreditCasePage() {
  const router = useRouter();
  const { user } = useAuth();

  const organizationUrl = useMemo(() => user?.organizations?.[0]?.url ?? null, [user]);

  // ── Customer search ──────────────────────────────────────────────
  const [allCustomers, setAllCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

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
  // "Customer created." confirmation, shown at the top of step 2. Transient: by the time
  // the user is filling in the credit case it is just noise.
  const {
    message: customerSuccess,
    show: showCustomerSuccess,
    clear: clearCustomerSuccess,
  } = useTransientMessage();

  // ── Credit case fields ───────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("customer");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [currency, setCurrency] = useState("MXN");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  const [submittingCreditCase, setSubmittingCreditCase] = useState(false);

  // ── Step 3: document requirements ────────────────────────────────
  const [createdCreditCase, setCreatedCreditCase] = useState<CreditCase | null>(null);
  const [fileTypes, setFileTypes] = useState<FileType[] | null>(null);
  const [defaultTemplate, setDefaultTemplate] = useState<RequirementTemplate | null>(null);
  const [submittingRequirements, setSubmittingRequirements] = useState(false);
  // Populated only when REPLACING an existing default would change other open cases.
  const [impact, setImpact] = useState<TemplateImpactEntry[] | null>(null);
  const [applyingImpact, setApplyingImpact] = useState(false);
  // What the default contained before this save, so Cancel can put it back.
  const [previousDefaultIds, setPreviousDefaultIds] = useState<number[] | null>(null);

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

  // The newest customers, shown the moment the search field is focused so the user can
  // pick one without having to guess at a name first — the common case right after
  // creating a customer is starting a case for that same customer.
  const recentCustomers = useMemo(() => {
    if (!allCustomers) return [];
    return [...allCustomers]
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      )
      .slice(0, 8);
  }, [allCustomers]);

  // Flat, keyboard-navigable list backing the dropdown. Empty while customers load.
  //
  // With no search text it is the recent list, with no "create new" row — there is no
  // name yet to create anything under. Once the user types, it becomes the matches plus
  // that trailing create row.
  const dropdownOptions = useMemo<CustomerDropdownOption[]>(() => {
    if (allCustomers === null) return [];
    if (!search.trim()) {
      return recentCustomers.map((c) => ({ kind: "customer" as const, customer: c }));
    }
    return [
      ...filteredCustomers.map((c) => ({ kind: "customer" as const, customer: c })),
      { kind: "create" as const },
    ];
  }, [allCustomers, search, filteredCustomers, recentCustomers]);

  /** Whether the dropdown is currently showing the recent list rather than matches. */
  const showingRecent = !search.trim();

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

  function commitDropdownOption(option: CustomerDropdownOption | undefined) {
    if (!option) return;
    if (option.kind === "customer") {
      handleSelectExisting(option.customer);
    } else {
      handleStartCreate();
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || dropdownOptions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % dropdownOptions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + dropdownOptions.length) % dropdownOptions.length);
        break;
      case "Enter":
        e.preventDefault();
        commitDropdownOption(dropdownOptions[activeIndex]);
        break;
      case "Tab":
        // Commit the highlighted option, then let focus continue moving as normal.
        commitDropdownOption(dropdownOptions[activeIndex]);
        break;
      case "Escape":
        setShowDropdown(false);
        break;
    }
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
      showCustomerSuccess(`Customer "${customer.name}" created successfully.`);
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
      const creditCase = await createCreditCaseForExistingCustomer({
        customerUrl: linkedCustomer.url,
        requestedAmount: requestedAmount.trim() || undefined,
        currency,
        requestedTermDays: Number(requestedTermDays),
      });

      // Move on to choosing documents rather than leaving for the list. The case now
      // exists either way, so abandoning this step still leaves valid data behind.
      const [catalog, template] = await Promise.all([
        listFileTypes(),
        getDefaultTemplate(),
      ]);
      setCreatedCreditCase(creditCase);
      setFileTypes(catalog);
      setDefaultTemplate(template);
      setPhase("requirements");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create credit case");
    } finally {
      setSubmittingCreditCase(false);
    }
  }

  /**
   * The wizard's last step lands the user ON the credit case they just made.
   *
   * Deliberately not an intermediate "done — now click through" screen: the case exists
   * and is configured, so making the user press one more button to reach it was a step
   * that carried no decision.
   */
  function goToCreditCase() {
    if (createdCreditCase) router.push(`/credit-cases/${createdCreditCase.id}`);
  }

  async function handleApplyImpact() {
    if (!defaultTemplate || !impact) return;
    setApplyingImpact(true);
    setError(null);
    try {
      await applyTemplateToCases({
        template: defaultTemplate,
        creditCaseIds: impact.map((entry) => entry.credit_case_id),
      });
      setImpact(null);
      setPreviousDefaultIds(null);
      goToCreditCase();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update credit cases");
    } finally {
      setApplyingImpact(false);
    }
  }

  /** Accept the new default, but leave the other open cases on their old list. */
  function handleKeepOpenCases() {
    setImpact(null);
    setPreviousDefaultIds(null);
    goToCreditCase();
  }

  /**
   * Back out of replacing the default: put it back to what it was.
   *
   * The credit case itself keeps the documents that were chosen for it — only the
   * organization-wide default is undone, which is the thing the user is being asked
   * about here.
   */
  async function handleCancelImpact() {
    if (defaultTemplate && previousDefaultIds !== null) {
      setApplyingImpact(true);
      setError(null);
      try {
        const reverted = await updateTemplateItems({
          template: defaultTemplate,
          fileTypeIds: previousDefaultIds,
        });
        setDefaultTemplate(reverted);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to undo the change to your default requirements",
        );
        setApplyingImpact(false);
        return;
      }
      setApplyingImpact(false);
    }
    setImpact(null);
    setPreviousDefaultIds(null);
    goToCreditCase();
  }

  /**
   * Apply the user's document choice to the credit case just created.
   *
   * Whenever the user picks documents by hand they are asked whether that selection
   * should become their organization's default going forward — either creating their
   * first default, or replacing the one they already had. Saying yes writes the template
   * and then seeds the case FROM it, so the case stays linked to the template and later
   * edits to it can still be offered to this case. Saying no writes the documents to
   * this case alone and leaves the default untouched.
   */
  async function handleSubmitRequirements(selection: FileTypeChooserSelection) {
    if (!createdCreditCase) return;
    setSubmittingRequirements(true);
    setError(null);
    try {
      if (selection.mode === "default" && defaultTemplate) {
        await setCreditCaseRequirements({
          creditCase: createdCreditCase,
          requirementTemplateId: defaultTemplate.id,
        });
        goToCreditCase();
      } else if (selection.mode === "fileTypes" && selection.saveAsDefault) {
        // Captured before the write so Cancel in the impact dialog can put it back.
        const idsBeforeSave = templateFileTypeIds(defaultTemplate);
        // Replace the existing default, or create the first one.
        const template = defaultTemplate
          ? await updateTemplateItems({
              template: defaultTemplate,
              fileTypeIds: selection.fileTypeIds,
            })
          : await createDefaultTemplate({ fileTypeIds: selection.fileTypeIds });

        await setCreditCaseRequirements({
          creditCase: createdCreditCase,
          requirementTemplateId: template.id,
        });

        const replacedExisting = Boolean(defaultTemplate);
        setDefaultTemplate(template);

        // Replacing an existing default can leave OTHER cases in progress out of step
        // with it, so offer the same choice the Requirements page does. Not asked when
        // creating the first default — no earlier case could have been seeded from it.
        // This case itself was just re-seeded above, so it is already in sync and won't
        // appear in the list.
        const entries = replacedExisting ? await getTemplateImpact(template) : [];
        if (entries.length > 0) {
          // Hold here until the user answers; whatever they choose, the redirect
          // happens once the dialog closes.
          setPreviousDefaultIds(idsBeforeSave);
          setImpact(entries);
        } else {
          goToCreditCase();
        }
      } else if (selection.mode === "fileTypes") {
        await setCreditCaseRequirements({
          creditCase: createdCreditCase,
          fileTypeIds: selection.fileTypeIds,
        });
        goToCreditCase();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save requirements");
    } finally {
      setSubmittingRequirements(false);
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
            className="rounded-md border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
          >
            Back
          </Link>
        </div>

        <div className="mt-6 space-y-6">

          {/* ── Step 1: Customer ──────────────────────────────────── */}
          <section className="rounded-lg border bg-surface p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
                1
              </span>
              <h2 className="text-base font-semibold">Link a customer</h2>
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              To create a new credit case, first search for a customer or create a new one.
            </p>

            {linkedCustomer ? (
              /* Confirmed customer */
              <div className="mt-4 flex items-center justify-between rounded-md border border-success-line bg-success-surface px-4 py-3 text-sm">
                <span className="font-medium text-success">
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
                    clearCustomerSuccess();
                    setError(null);
                  }}
                  className="text-xs text-fg-muted underline hover:text-fg"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                {/* Search input + dropdown */}
                <div
                  className="relative mt-4"
                  onBlur={(e) => {
                    // Only close when focus leaves the whole combobox (input + listbox),
                    // not when it moves from the input onto one of the option buttons.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                      setShowDropdown(false);
                    }
                  }}
                >
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCreateMode(false);
                      setShowDropdown(true);
                      setActiveIndex(0);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search by name or RFC…"
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showDropdown}
                    aria-controls="new-credit-case-customer-listbox"
                    aria-activedescendant={
                      showDropdown && dropdownOptions[activeIndex]
                        ? `new-credit-case-customer-option-${activeIndex}`
                        : undefined
                    }
                  />

                  {showDropdown && (
                    <div
                      id="new-credit-case-customer-listbox"
                      role="listbox"
                      className="absolute z-10 mt-1 w-full rounded-md border bg-surface shadow-lg"
                    >
                      {allCustomers === null ? (
                        <div className="px-4 py-3 text-sm text-fg-subtle">
                          Loading customers…
                        </div>
                      ) : showingRecent && dropdownOptions.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-fg-subtle">
                          No customers yet — type a name to create one.
                        </div>
                      ) : (
                        <>
                          {showingRecent && (
                            <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
                              Recent customers
                            </div>
                          )}
                          {dropdownOptions.map((option, index) => {
                            const active = index === activeIndex;
                            const optionId = `new-credit-case-customer-option-${index}`;
                            if (option.kind === "customer") {
                              const c = option.customer;
                              return (
                                <button
                                  key={c.url}
                                  id={optionId}
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  onMouseDown={() => handleSelectExisting(c)}
                                  className={[
                                    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm",
                                    active ? "bg-surface-muted" : "hover:bg-surface-subtle",
                                  ].join(" ")}
                                >
                                  <span className="font-medium">{c.name}</span>
                                  {c.rfc && (
                                    <span className="text-fg-subtle">· {c.rfc}</span>
                                  )}
                                </button>
                              );
                            }
                            return (
                              <React.Fragment key="create">
                                {filteredCustomers.length > 0 && <div className="border-t" />}
                                <button
                                  id={optionId}
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  onMouseEnter={() => setActiveIndex(index)}
                                  onMouseDown={handleStartCreate}
                                  className={[
                                    "flex w-full items-center px-4 py-2.5 text-left text-sm",
                                    filteredCustomers.length > 0 ? "text-fg-muted" : "",
                                    active ? "bg-surface-muted" : "hover:bg-surface-subtle",
                                  ].join(" ")}
                                >
                                  + Create &ldquo;{search.trim()}&rdquo; as new customer
                                </button>
                              </React.Fragment>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Create new customer form */}
                {createMode && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); void handleCreateCustomer(); }}
                    className="mt-4 space-y-4 rounded-md border bg-surface-subtle p-4"
                  >
                    <div className="text-sm font-semibold text-fg">
                      New customer
                    </div>

                    <label className="block">
                      <div className="text-sm font-medium">
                        Name <span className="text-danger">*</span>
                      </div>
                      <input
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                        className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                        placeholder="Customer name"
                      />
                    </label>

                    <div>
                      <button
                        type="button"
                        onClick={() => setShowMoreFields((v) => !v)}
                        className="text-sm font-medium text-fg-muted underline hover:text-fg"
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
                            className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                            placeholder="RFC"
                          />
                        </label>
                        <label className="block">
                          <div className="text-sm font-medium">Razón social (legal name)</div>
                          <input
                            value={legalName}
                            onChange={(e) => setLegalName(e.target.value)}
                            className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                            placeholder="Razón social"
                          />
                        </label>
                        <div className="border-t pt-4">
                          <div className="text-sm font-medium text-fg-secondary">
                            Domicilio fiscal
                          </div>
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <div className="text-sm font-medium">Código postal</div>
                              <input
                                value={codigoPostal}
                                onChange={(e) => setCodigoPostal(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Tipo de vialidad</div>
                              <input
                                value={tipoDeVialidad}
                                onChange={(e) => setTipoDeVialidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                                placeholder="Calle, avenida, etc."
                              />
                            </label>
                            <label className="block sm:col-span-2">
                              <div className="text-sm font-medium">Nombre de vialidad</div>
                              <input
                                value={nombreDeVialidad}
                                onChange={(e) => setNombreDeVialidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Número exterior</div>
                              <input
                                value={numeroExterior}
                                onChange={(e) => setNumeroExterior(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Número interior</div>
                              <input
                                value={numeroInterior}
                                onChange={(e) => setNumeroInterior(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Colonia</div>
                              <input
                                value={nombreDeLaColonia}
                                onChange={(e) => setNombreDeLaColonia(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Localidad</div>
                              <input
                                value={nombreDeLaLocalidad}
                                onChange={(e) => setNombreDeLaLocalidad(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Municipio</div>
                              <input
                                value={nombreDelMunicipio}
                                onChange={(e) => setNombreDelMunicipio(e.target.value)}
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <div className="text-sm font-medium">Entidad federativa</div>
                              <input
                                value={nombreDeLaEntidadFederativa}
                                onChange={(e) =>
                                  setNombreDeLaEntidadFederativa(e.target.value)
                                }
                                className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                        {error}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={submittingCustomer || !customerName.trim() || !organizationUrl}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                      >
                        {submittingCustomer ? "Creating…" : "Create customer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateMode(false);
                          setSearch("");
                        }}
                        className="text-sm text-fg-muted hover:text-fg"
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
            <section className="rounded-lg border bg-surface p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
                  2
                </span>
                <h2 className="text-base font-semibold">Credit case details</h2>
              </div>

              {customerSuccess && (
                <div className="mt-4 rounded-md border border-success-line bg-success-surface p-3 text-sm text-success">
                  {customerSuccess}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); void handleCreateCreditCase(); }} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block">
                    <div className="text-sm font-medium">Requested amount</div>
                    <MoneyInput
                      value={requestedAmount}
                      onChange={setRequestedAmount}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium">Currency</div>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
                    >
                      {CURRENCY_OPTIONS.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <div className="text-sm font-medium">Requested term (days)</div>
                    <select
                      value={requestedTermDays}
                      onChange={(e) => setRequestedTermDays(e.target.value)}
                      className="mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
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
                  <div className="rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingCreditCase}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                  >
                    {submittingCreditCase ? "Creating…" : "Create credit case"}
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* ── Step 3: Required documents ────────────────────────── */}
          {phase === "requirements" && createdCreditCase && fileTypes && (
            <section className="rounded-lg border bg-surface p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
                  3
                </span>
                <h2 className="text-base font-semibold">
                  {defaultTemplate
                    ? "Choose required files for this credit case (or default template)"
                    : "Choose the required files for every new credit case"}
                </h2>
              </div>

              <p className="mt-2 text-sm text-fg-muted">
                {defaultTemplate
                  ? "Take your organization's default list, or pick the documents this customer needs."
                  : "Choose the documents this credit case needs. You'll be asked whether to keep them as your default for future cases."}
              </p>

              {error && (
                <div className="mt-4 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              <>
                  <div className="mt-6">
                    <FileTypeChooser
                      fileTypes={fileTypes}
                      defaultOption={
                        defaultTemplate
                          ? {
                              // Show what the default actually contains on hover, so the
                              // user isn't accepting an unseen list.
                              fileTypes: fileTypes.filter((f) =>
                                templateFileTypeIds(defaultTemplate).includes(f.id),
                              ),
                              preselected: true,
                            }
                          : undefined
                      }
                      // Asked whenever documents are picked by hand — either to set the
                      // first default, or to replace the existing one. Only skipped when
                      // the user took the default as-is, where there is nothing to decide.
                      saveAsDefaultQuestion={
                        defaultTemplate
                          ? "Do you want to make these your NEW default required files for future credit cases? (No keeps your current default.)"
                          : "Do you want to save your chosen files as your default required files for this and future credit cases?"
                      }
                      submitLabel="Submit"
                      submitting={submittingRequirements}
                      onSubmit={(selection) => void handleSubmitRequirements(selection)}
                    />
                  </div>

                  <div className="mt-6 border-t pt-4">
                    <button
                      type="button"
                      onClick={() => router.push(`/credit-cases/${createdCreditCase.id}`)}
                      className="text-sm text-fg-muted underline hover:text-fg"
                    >
                      Skip for now
                    </button>
                  </div>
                </>
            </section>
          )}

        </div>

        {impact && (
          <ImpactWarning
            entries={impact}
            busy={applyingImpact}
            onApply={() => void handleApplyImpact()}
            onKeep={handleKeepOpenCases}
            onCancel={() => void handleCancelImpact()}
          />
        )}
      </RequireAuth>
    </AppShell>
  );
}
