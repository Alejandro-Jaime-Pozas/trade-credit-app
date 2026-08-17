"use client";

/**
 * Credit case detail (`/credit-cases/[id]`).
 *
 * View/edit a single trade credit case: status, amounts, linked customer,
 * required documents checklist, and file uploads (single or bulk).
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentList, documentDisplayName } from "@/components/DocumentList";
import { FileUploadField } from "@/components/FileUploadField";
import { MoneyInput } from "@/components/MoneyInput";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusDot } from "@/components/StatusDot";
import { apiForm, apiJson, ApiError, drfListAll } from "@/lib/api";
import {
  CREDIT_CASE_STATUS_LABELS,
  CREDIT_CASE_VERDICT_LABELS,
  REQUESTED_TERM_DAYS_OPTIONS,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { useTransientMessage } from "@/lib/useTransientMessage";
import {
  addCreditCaseRequirement,
  fileTypeLabel,
  listCreditCaseRequirements,
  listFileTypes,
  removeCreditCaseRequirement,
} from "@/lib/fileTypes";
import type {
  CreditCase,
  CreditCaseRequirement,
  Customer,
  FileType,
  UploadDocument,
  User,
} from "@/lib/types";

export default function CreditCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [creditCase, setCreditCase] = useState<CreditCase | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  // The document catalog, used to turn file type keys into readable labels. Served by
  // the backend rather than hardcoded here, so newly added document types show up
  // with proper names instead of raw keys.
  const [fileTypes, setFileTypes] = useState<FileType[] | null>(null);
  // This case's own requirement rows, needed to add/remove individual documents.
  const [requirements, setRequirements] = useState<CreditCaseRequirement[] | null>(null);
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [savingRequirement, setSavingRequirement] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requestedAmount, setRequestedAmount] = useState("");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  const [currency, setCurrency] = useState("MXN");
  const [status, setStatus] = useState("missing_documents");
  const [verdict, setVerdict] = useState("pending");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [users, setUsers] = useState<User[] | null>(null);

  const [saving, setSaving] = useState(false);
  // Success confirmation for the Save button. Previously a save gave no feedback at all
  // beyond the spinner stopping, so there was no way to tell it had worked. Transient:
  // it takes itself down after a few seconds rather than lingering indefinitely.
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();
  const [deleting, setDeleting] = useState(false);
  // Deletes and removals are irreversible, so each waits on an explicit confirmation.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [requirementToRemove, setRequirementToRemove] =
    useState<CreditCaseRequirement | null>(null);
  const [refreshingUploads, setRefreshingUploads] = useState(false);
  // Url of the document whose file type is being corrected, so only its badge spins.
  const [savingFileTypeUrl, setSavingFileTypeUrl] = useState<string | null>(null);
  // Url of the document being renamed, so only that row shows a spinner.
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  // Deleting a document can un-satisfy a requirement, so it waits on a confirmation.
  const [documentToDelete, setDocumentToDelete] = useState<UploadDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);

  const loadUploads = useCallback(async (creditCaseUrl: string) => {
    const allUploads = await drfListAll<UploadDocument>({
      path: "/upload-documents/",
    });
    return allUploads.filter((u) => u.credit_case?.url === creditCaseUrl);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [cc, allUsers] = await Promise.all([
          apiJson<CreditCase>({ pathOrUrl: `/credit-cases/${id}/` }),
          drfListAll<User>({ path: "/users/" }),
        ]);
        if (cancelled) return;
        setCreditCase(cc);
        setRequestedAmount(cc.requested_amount ?? "");
        setRequestedTermDays(String(cc.requested_term_days ?? 30));
        setCurrency(cc.currency ?? "MXN");
        setStatus(cc.status ?? "missing_documents");
        setVerdict(cc.verdict ?? "pending");
        setAssignedTo(cc.assigned_to?.url ?? "");
        setUsers(allUsers);

        const cust = await apiJson<Customer>({ pathOrUrl: cc.customer.url });
        if (cancelled) return;
        setCustomer(cust);

        const [caseUploads, catalog, caseRequirements] = await Promise.all([
          loadUploads(cc.url),
          listFileTypes(),
          listCreditCaseRequirements(cc),
        ]);
        if (cancelled) return;
        setUploads(caseUploads);
        setFileTypes(catalog);
        setRequirements(caseRequirements);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load credit case");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, loadUploads]);

  const uploadedTypeNames = useMemo(() => {
    if (!uploads) return new Set<string>();
    const names = uploads
      .map((u) => u.file_type_name)
      .filter((name) => Boolean(name) && name !== "unknown");
    return new Set(names as string[]);
  }, [uploads]);

  const requiredFileStatuses = useMemo(() => {
    return (creditCase?.required_file_type_names ?? []).map((fileType) => ({
      fileType,
      label: fileTypeLabel(fileType, fileTypes),
      satisfied: uploadedTypeNames.has(fileType),
    }));
  }, [creditCase?.required_file_type_names, uploadedTypeNames, fileTypes]);

  // Optional documents are listed for the user's benefit but never block completion,
  // so they are shown apart from the required ones.
  const optionalFileStatuses = useMemo(() => {
    return (creditCase?.optional_file_type_names ?? []).map((fileType) => ({
      fileType,
      label: fileTypeLabel(fileType, fileTypes),
      satisfied: uploadedTypeNames.has(fileType),
    }));
  }, [creditCase?.optional_file_type_names, uploadedTypeNames, fileTypes]);

  /**
   * Re-read the case and its requirements after an add/remove.
   *
   * The case has to come back too: a manual requirement change can flip
   * `requirements_complete` and move `status` (adding one pulls a waiting case back to
   * "missing documents"; removing the last outstanding one advances it).
   */
  /**
   * Put a freshly-fetched case on screen, including the fields the edit form binds to.
   *
   * The form inputs are separate state, so setting only `creditCase` would leave the
   * Status and Verdict selects showing what the user last saw rather than what the
   * backend now holds — which is exactly how an upload that advanced the case ended up
   * needing a page refresh to be visible.
   */
  const applyCase = useCallback((refreshed: CreditCase) => {
    setCreditCase(refreshed);
    setStatus(refreshed.status ?? "missing_documents");
    setVerdict(refreshed.verdict ?? "pending");
    setAssignedTo(refreshed.assigned_to?.url ?? "");
  }, []);

  async function refreshRequirements(current: CreditCase) {
    const [refreshedCase, caseRequirements] = await Promise.all([
      apiJson<CreditCase>({ pathOrUrl: current.url }),
      listCreditCaseRequirements(current),
    ]);
    applyCase(refreshedCase);
    setRequirements(caseRequirements);
  }

  async function handleAddRequirement(fileTypeId: number) {
    if (!creditCase) return;
    setSavingRequirement(true);
    setError(null);
    try {
      await addCreditCaseRequirement({ creditCase, fileTypeId });
      await refreshRequirements(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add requirement");
    } finally {
      setSavingRequirement(false);
    }
  }

  async function handleRemoveRequirement(requirement: CreditCaseRequirement) {
    if (!creditCase) return;
    setSavingRequirement(true);
    setError(null);
    try {
      await removeCreditCaseRequirement(requirement);
      await refreshRequirements(creditCase);
      setRequirementToRemove(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove requirement");
    } finally {
      setSavingRequirement(false);
    }
  }

  /** The edit controls as they'd look straight from the server, with nothing changed. */
  function creditCaseFormValues(source: CreditCase | null) {
    return {
      requestedAmount: source?.requested_amount ?? "",
      requestedTermDays: String(source?.requested_term_days ?? 30),
      currency: source?.currency ?? "MXN",
      status: source?.status ?? "missing_documents",
      verdict: source?.verdict ?? "pending",
      assignedTo: source?.assigned_to?.url ?? "",
    };
  }

  /** True when a control no longer matches what was loaded, so there is work to lose. */
  const hasUnsavedChanges = useMemo(() => {
    const saved = creditCaseFormValues(creditCase);
    return (
      requestedAmount !== saved.requestedAmount ||
      requestedTermDays !== saved.requestedTermDays ||
      currency !== saved.currency ||
      status !== saved.status ||
      verdict !== saved.verdict ||
      assignedTo !== saved.assignedTo
    );
  }, [creditCase, requestedAmount, requestedTermDays, currency, status, verdict, assignedTo]);

  /** Put every control back to the loaded case, abandoning what was changed. */
  function handleDiscardChanges() {
    const saved = creditCaseFormValues(creditCase);
    setRequestedAmount(saved.requestedAmount);
    setRequestedTermDays(saved.requestedTermDays);
    setCurrency(saved.currency);
    setStatus(saved.status);
    setVerdict(saved.verdict);
    setAssignedTo(saved.assignedTo);
    clearSaved();
    setError(null);
  }

  async function handleDeleteCreditCase() {
    if (!creditCase) return;
    setDeleting(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: creditCase.url, method: "DELETE" });
      router.push("/credit-cases");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  /**
   * Re-read the uploads AND the credit case itself.
   *
   * The case has to be re-read too: classification runs on the backend after an upload,
   * and completing the last required document flips `requirements_complete` and can
   * advance `status`. Refreshing only the uploads would leave those stale on screen.
   */
  async function refreshUploads() {
    if (!creditCase) return;
    setRefreshingUploads(true);
    setError(null);
    try {
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh uploads");
    } finally {
      setRefreshingUploads(false);
    }
  }

  /** Re-read everything an upload can change, in one round trip. */
  async function reloadCaseAndUploads(current: CreditCase) {
    const [caseUploads, refreshedCase, caseRequirements] = await Promise.all([
      loadUploads(current.url),
      apiJson<CreditCase>({ pathOrUrl: current.url }),
      listCreditCaseRequirements(current),
    ]);
    setUploads(caseUploads);
    setRequirements(caseRequirements);
    applyCase(refreshedCase);
  }

  /**
   * Upload the chosen files, then re-read the case.
   *
   * The backend classifies each file before it responds, and finishing the last required
   * document flips `requirements_complete` and advances `status`. Re-reading here is what
   * makes that appear without the user reloading the page.
   */
  async function handleUpload(chosen: File[]) {
    if (!creditCase || !customer) return;
    setError(null);

    await Promise.all(
      chosen.map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("credit_case", creditCase.url);
        fd.append("customer", customer.url);
        return apiForm<UploadDocument[]>({
          pathOrUrl: "/upload-documents/",
          method: "POST",
          form: fd,
        });
      }),
    );

    await reloadCaseAndUploads(creditCase);
  }

  /**
   * Give a document a name a reviewer will recognize.
   *
   * Only the display label changes — the stored file and its original name are untouched
   * — so nothing about the requirement checklist can move here, and the case does not
   * need re-reading.
   */
  async function handleRenameDocument(doc: UploadDocument, friendlyName: string | null) {
    setRenamingUrl(doc.url);
    setError(null);
    try {
      const updated = await apiJson<UploadDocument>({
        pathOrUrl: doc.url,
        method: "PATCH",
        body: { friendly_file_name: friendlyName },
      });
      setUploads((prev) => (prev ?? []).map((u) => (u.url === updated.url ? updated : u)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename document");
    } finally {
      setRenamingUrl(null);
    }
  }

  /**
   * Delete a document from this case.
   *
   * Re-reads the case afterwards: the backend recomputes the case's status on delete, so
   * removing the file that satisfied the last requirement pulls the case back to
   * "missing documents" — which the user should see happen.
   */
  async function handleDeleteDocument(doc: UploadDocument) {
    if (!creditCase) return;
    setDeletingDocument(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: doc.url, method: "DELETE" });
      setDocumentToDelete(null);
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocument(false);
    }
  }

  /**
   * Correct a document GPT labelled wrongly.
   *
   * Re-reads the case afterwards because the type IS what satisfies a requirement:
   * relabelling a file can complete the checklist (or un-complete it).
   */
  async function handleChangeFileType(doc: UploadDocument, key: string) {
    if (!creditCase) return;
    setSavingFileTypeUrl(doc.url);
    setError(null);
    try {
      await apiJson<UploadDocument>({
        pathOrUrl: doc.url,
        method: "PATCH",
        body: { file_type_name: key },
      });
      await reloadCaseAndUploads(creditCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change file type");
    } finally {
      setSavingFileTypeUrl(null);
    }
  }

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {customer ? `${customer.name} ${creditCase?.id}` : creditCase ? `Credit case #${creditCase.id}` : ""}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Update request fields, track required documents, and upload files.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/credit-cases"
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Back
            </Link>
            <button
              type="button"
              disabled={!creditCase || deleting}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmingDelete}
          title="Delete this credit case?"
          name={
            creditCase
              ? `${customer?.name ?? "Credit case"} #${creditCase.id}`
              : undefined
          }
          description="Its uploaded documents and requirement list go with it."
          busy={deleting}
          onConfirm={() => void handleDeleteCreditCase()}
          onCancel={() => setConfirmingDelete(false)}
        />

        <ConfirmDialog
          open={requirementToRemove !== null}
          title="Remove this required document?"
          name={
            requirementToRemove
              ? fileTypeLabel(requirementToRemove.file_type_key, fileTypes)
              : undefined
          }
          description="This credit case will no longer ask the customer for it."
          confirmLabel="Remove"
          busyLabel="Removing…"
          busy={savingRequirement}
          onConfirm={() => {
            if (requirementToRemove) void handleRemoveRequirement(requirementToRemove);
          }}
          onCancel={() => setRequirementToRemove(null)}
        />

        <ConfirmDialog
          open={documentToDelete !== null}
          title="Delete this document?"
          name={documentToDelete ? documentDisplayName(documentToDelete) : undefined}
          description="If this file was satisfying a required document, this case goes back to missing it."
          busy={deletingDocument}
          onConfirm={() => {
            if (documentToDelete) void handleDeleteDocument(documentToDelete);
          }}
          onCancel={() => setDocumentToDelete(null)}
        />

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-lg border bg-white p-6">
            <h2 className="text-base font-semibold">Details</h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border bg-zinc-50 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-zinc-600">
                  Customer
                </div>
                <div className="mt-1 font-medium">
                  {customer ? (
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-zinc-900 underline"
                    >
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-zinc-50 p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-zinc-600">
                  Decided
                </div>
                <div className="mt-1 font-medium">
                  {creditCase?.verdict_at ? formatDate(creditCase.verdict_at) : "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium">Status</div>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    disabled={!creditCase}
                    className="mt-1 w-full rounded-md border bg-white py-2 pl-8 pr-3 text-sm disabled:opacity-60"
                  >
                    {Object.entries(CREDIT_CASE_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2">
                    <StatusDot status={status} />
                  </span>
                </div>
              </label>
              {/* Editable, like status and assigned_to: this is where a reviewer records
                  their approve/reject decision. The backend timestamps it. */}
              <label className="block">
                <div className="text-sm font-medium">Verdict</div>
                <select
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value)}
                  disabled={!creditCase}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  {Object.entries(CREDIT_CASE_VERDICT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium">Assigned to</div>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={!creditCase}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {(users ?? []).map((u) => (
                    <option key={u.url} value={u.url}>
                      {u.first_name && u.last_name
                        ? `${u.first_name} ${u.last_name}`
                        : u.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
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

            <div className="mt-4 flex items-center justify-end gap-3">
              {/* Confirms the save actually landed. `aria-live` so it is announced
                  rather than only appearing. */}
              {saved && (
                <span
                  aria-live="polite"
                  className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"
                >
                  {saved}
                </span>
              )}
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={!creditCase || saving || !hasUnsavedChanges}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={!creditCase || saving}
                onClick={async () => {
                  if (!creditCase) return;
                  setSaving(true);
                  setError(null);
                  clearSaved();
                  try {
                    const updated = await apiJson<CreditCase>({
                      pathOrUrl: creditCase.url,
                      method: "PATCH",
                      body: {
                        requested_amount: requestedAmount.trim() || null,
                        currency,
                        requested_term_days: Number(requestedTermDays),
                        customer: creditCase.customer.url,
                        status,
                        verdict,
                        assigned_to: assignedTo || null,
                      },
                    });
                    applyCase(updated);
                    showSaved("Saved.");
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Save failed");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            <div className="mt-6 text-xs text-zinc-500">
              Created: {creditCase ? formatDate(creditCase.created_at) : "—"}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">Required documents</h2>

              {/* Only meaningful once the case actually has requirements — a case with
                  none isn't "incomplete", it just hasn't been set up yet. */}
              <div className="flex shrink-0 items-center gap-2">
                {(requiredFileStatuses.length > 0 ||
                  optionalFileStatuses.length > 0) && (
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      creditCase?.requirements_complete
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800",
                    ].join(" ")}
                  >
                    {creditCase?.requirements_complete
                      ? "Complete"
                      : `${requiredFileStatuses.filter((r) => !r.satisfied).length} missing`}
                  </span>
                )}

                {/* Once a case is submitted its requirement list is the reviewer's
                    evidence, so the backend refuses edits — don't offer them either. */}
                {creditCase && !creditCase.submitted_at && (
                  <button
                    type="button"
                    onClick={() => setEditingRequirements((on) => !on)}
                    className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-zinc-50"
                  >
                    {editingRequirements ? "Done" : "Edit"}
                  </button>
                )}
              </div>
            </div>

            <p className="mt-2 text-sm text-zinc-600">
              The documents this credit case needs. Upload files below; the backend
              classifies each file after upload and ticks off whatever it matches.
            </p>

            {creditCase?.requirements_completed_at && (
              <p className="mt-2 text-xs text-zinc-500">
                Requirements first met {formatDate(creditCase.requirements_completed_at)}
                {!creditCase.requirements_complete &&
                  " — a document has been required since then"}
              </p>
            )}

            {requiredFileStatuses.length === 0 &&
              optionalFileStatuses.length === 0 && (
                <div className="mt-4 rounded-md border border-dashed p-4 text-sm text-zinc-600">
                  No required documents set for this credit case.{" "}
                  <Link href="/requirements" className="underline">
                    Set up your default requirements
                  </Link>
                  .
                </div>
              )}

            {requiredFileStatuses.length > 0 && (
              <ul className="mt-4 space-y-2">
                {requiredFileStatuses.map((req) => {
                  const row = requirements?.find(
                    (r) => r.file_type_key === req.fileType,
                  );
                  return (
                    <li
                      key={req.fileType}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span>{req.label}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            req.satisfied
                              ? "text-xs font-medium text-green-700"
                              : "text-xs font-medium text-amber-700"
                          }
                        >
                          {req.satisfied ? "Uploaded" : "Missing"}
                        </span>
                        {editingRequirements && row && (
                          <button
                            type="button"
                            disabled={savingRequirement}
                            onClick={() => setRequirementToRemove(row)}
                            aria-label={`Remove ${req.label}`}
                            className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {editingRequirements && fileTypes && (
              <div className="mt-4 rounded-md border border-dashed p-3">
                <p className="text-xs font-medium text-zinc-700">
                  Add a document this credit case needs
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Only affects this case. Removing one your organization&apos;s default
                  asks for will not come back the next time that default changes.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fileTypes
                    .filter(
                      (f) =>
                        !requiredFileStatuses.some((r) => r.fileType === f.key) &&
                        !optionalFileStatuses.some((r) => r.fileType === f.key),
                    )
                    .map((fileType) => (
                      <button
                        key={fileType.id}
                        type="button"
                        disabled={savingRequirement}
                        onClick={() => void handleAddRequirement(fileType.id)}
                        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60"
                      >
                        + {fileType.label_en}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {optionalFileStatuses.length > 0 && (
              <>
                <p className="mt-6 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Optional
                </p>
                <ul className="mt-2 space-y-2">
                  {optionalFileStatuses.map((req) => (
                    <li
                      key={req.fileType}
                      className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm"
                    >
                      <span className="text-zinc-700">{req.label}</span>
                      <span className="text-xs font-medium text-zinc-500">
                        {req.satisfied ? "Uploaded" : "Not provided"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="lg:col-span-3 rounded-lg border bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Upload files</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Choosing files uploads them straight away. File type is detected
                  automatically — if one is labelled wrongly, correct it on the document
                  itself below.
                </p>
              </div>
              <button
                type="button"
                disabled={!creditCase || refreshingUploads}
                onClick={refreshUploads}
                className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
              >
                {refreshingUploads ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            <div className="mt-4">
              <FileUploadField
                multiple
                // Keyed on the case so an upload still in flight is still reported as
                // running after navigating away and back.
                scope={creditCase?.url}
                disabled={!creditCase || !customer}
                onUpload={handleUpload}
                onBackgroundUploadsSettled={() => {
                  if (creditCase) void reloadCaseAndUploads(creditCase);
                }}
              />
            </div>

            <div className="mt-4">
              <DocumentList
                documents={uploads}
                fileTypes={fileTypes}
                savingUrl={savingFileTypeUrl}
                renamingUrl={renamingUrl}
                onChangeFileType={(doc, key) => void handleChangeFileType(doc, key)}
                onRename={(doc, name) => void handleRenameDocument(doc, name)}
                onDelete={setDocumentToDelete}
              />
            </div>
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
