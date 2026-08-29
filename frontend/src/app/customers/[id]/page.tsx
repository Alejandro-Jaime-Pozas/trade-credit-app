"use client";

/**
 * Customer detail (`/customers/[id]`).
 *
 * View/edit one customer, manage contacts, and upload documents. The `[id]`
 * folder name is Next.js dynamic routing — `useParams()` reads the id from the URL.
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { AiNotice } from "@/components/AiNotice";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CreditCaseTable } from "@/components/CreditCaseTable";
import { DocumentList, documentDisplayName } from "@/components/DocumentList";
import { FileUploadField } from "@/components/FileUploadField";
import { RequireAuth } from "@/components/RequireAuth";
import { apiForm, apiJson, ApiError, drfListAll, logError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { listFileTypes } from "@/lib/fileTypes";
import { formatDate } from "@/lib/format";
import { useClassificationPolling } from "@/lib/useClassificationPolling";
import { useTransientMessage } from "@/lib/useTransientMessage";
import type {
  CreditCase,
  Customer,
  CustomerContact,
  FileType,
  UploadDocument,
} from "@/lib/types";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  // This customer's credit cases, shown in the same table as the dashboard.
  const [creditCases, setCreditCases] = useState<CreditCase[] | null>(null);
  // The document catalog, so uploads show readable type names and can be re-labelled.
  const [fileTypes, setFileTypes] = useState<FileType[] | null>(null);
  const [savingFileTypeUrl, setSavingFileTypeUrl] = useState<string | null>(null);
  // Url of the document being renamed, so only that row shows a spinner.
  const [renamingUrl, setRenamingUrl] = useState<string | null>(null);
  // Deleting a document is irreversible, so it waits on an explicit confirmation.
  const [documentToDelete, setDocumentToDelete] = useState<UploadDocument | null>(null);
  const [deletingDocument, setDeletingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState("");
  const [editingRfc, setEditingRfc] = useState("");
  const [editingStreet, setEditingStreet] = useState("");
  const [editingZip, setEditingZip] = useState("");

  const organizationUrl = useMemo(() => user?.organizations?.[0]?.url ?? null, [user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const cust = await apiJson<Customer>({ pathOrUrl: `/customers/${id}/` });
        if (cancelled) return;
        setCustomer(cust);
        setEditingName(cust.name ?? "");
        setEditingRfc(cust.rfc ?? "");
        setEditingStreet(cust.nombre_de_vialidad ?? "");
        setEditingZip(cust.codigo_postal ?? "");

        const allContacts = await drfListAll<CustomerContact>({
          path: "/customer-contacts/",
        });
        if (cancelled) return;
        setContacts(allContacts.filter((c) => c.customer.url === cust.url));

        const [allUploads, allCases, catalog] = await Promise.all([
          drfListAll<UploadDocument>({ path: "/upload-documents/" }),
          drfListAll<CreditCase>({ path: "/credit-cases/" }),
          listFileTypes(),
        ]);
        if (cancelled) return;
        setUploads(allUploads.filter((u) => u.customer?.url === cust.url));
        setFileTypes(catalog);
        // Newest first, matching the dashboard's default order.
        setCreditCases(
          allCases
            .filter((c) => c.customer?.url === cust.url)
            .sort(
              (a, b) =>
                new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
                new Date(a.updated_at ?? a.created_at ?? 0).getTime(),
            ),
        );
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load customer");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const [saving, setSaving] = useState(false);
  // Success confirmation for the Save button — a save previously gave no feedback at all.
  // Transient: it takes itself down after a few seconds, so the page never sits there
  // claiming a save that happened minutes ago.
  const { message: saved, show: showSaved, clear: clearSaved } = useTransientMessage();
  const [deleting, setDeleting] = useState(false);
  // Deletes are irreversible, so each waits on an explicit confirmation.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<CustomerContact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  /** The edit boxes as they'd look straight from the server, with nothing typed. */
  function customerFormValues(source: Customer | null) {
    return {
      name: source?.name ?? "",
      rfc: source?.rfc ?? "",
      street: source?.nombre_de_vialidad ?? "",
      zip: source?.codigo_postal ?? "",
    };
  }

  /** True when an edit box no longer matches what was loaded, so there is work to lose. */
  const hasUnsavedChanges = useMemo(() => {
    const saved = customerFormValues(customer);
    return (
      editingName !== saved.name ||
      editingRfc !== saved.rfc ||
      editingStreet !== saved.street ||
      editingZip !== saved.zip
    );
  }, [customer, editingName, editingRfc, editingStreet, editingZip]);

  /** Put every edit box back to the loaded record, abandoning what was typed. */
  function handleDiscardChanges() {
    const saved = customerFormValues(customer);
    setEditingName(saved.name);
    setEditingRfc(saved.rfc);
    setEditingStreet(saved.street);
    setEditingZip(saved.zip);
    clearSaved();
    setError(null);
  }

  async function handleDeleteCustomer() {
    if (!customer) return;
    setDeleting(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: customer.url, method: "DELETE" });
      router.push("/customers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function handleDeleteContact(contact: CustomerContact) {
    setDeletingContact(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: contact.url, method: "DELETE" });
      setContacts((prev) => (prev ?? []).filter((x) => x.url !== contact.url));
      setContactToDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeletingContact(false);
    }
  }

  /**
   * Upload the chosen files against this customer.
   *
   * The upload answers as soon as the rows are saved; classification and CSF field
   * extraction then run in a Celery worker, so the customer's rfc/zip/street are filled
   * in server-side some seconds later. The re-read below catches anything already done,
   * and `useClassificationPolling` picks up the rest as the worker finishes.
   */
  async function handleUpload(chosen: File[]) {
    if (!customer) return;
    setError(null);

    const createdBatches = await Promise.all(
      chosen.map(async (file) => {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("customer", customer.url);
        return apiForm<UploadDocument[]>({
          pathOrUrl: "/upload-documents/",
          method: "POST",
          form: fd,
        });
      }),
    );
    setUploads((prev) => [...(prev ?? []), ...createdBatches.flat()]);

    try {
      const refreshed = await apiJson<Customer>({ pathOrUrl: customer.url });
      setCustomer(refreshed);
      // Only fill an edit box that is still blank, so an in-progress (unsaved) edit is
      // never clobbered by the extracted value.
      setEditingRfc((prev) => prev || refreshed.rfc || "");
      setEditingStreet((prev) => prev || refreshed.nombre_de_vialidad || "");
      setEditingZip((prev) => prev || refreshed.codigo_postal || "");
    } catch (err) {
      logError("customer:refreshAfterUpload", err);
    }
  }

  /**
   * Re-read this customer and their documents.
   *
   * Used when an upload started before this page mounted finishes: nothing here awaited
   * it, so the new document and any CSF-extracted fields have to be pulled in.
   */
  async function reloadCustomerDocuments() {
    if (!customer) return;
    try {
      const [refreshed, allUploads] = await Promise.all([
        apiJson<Customer>({ pathOrUrl: customer.url }),
        drfListAll<UploadDocument>({ path: "/upload-documents/" }),
      ]);
      setCustomer(refreshed);
      setUploads(allUploads.filter((u) => u.customer?.url === refreshed.url));
      setEditingRfc((prev) => prev || refreshed.rfc || "");
      setEditingStreet((prev) => prev || refreshed.nombre_de_vialidad || "");
      setEditingZip((prev) => prev || refreshed.codigo_postal || "");
    } catch (err) {
      logError("customer:reloadAfterBackgroundUpload", err);
    }
  }

  /**
   * Give a document a name a reviewer will recognize.
   *
   * Only the display label changes: the stored file and the name it arrived with are
   * left exactly as they were.
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

  /** Delete a document uploaded against this customer. */
  async function handleDeleteDocument(doc: UploadDocument) {
    setDeletingDocument(true);
    setError(null);
    try {
      await apiJson<void>({ pathOrUrl: doc.url, method: "DELETE" });
      setUploads((prev) => (prev ?? []).filter((u) => u.url !== doc.url));
      setDocumentToDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete document");
    } finally {
      setDeletingDocument(false);
    }
  }

  /** Correct a document GPT labelled wrongly. */
  async function handleChangeFileType(doc: UploadDocument, key: string) {
    setSavingFileTypeUrl(doc.url);
    setError(null);
    try {
      const updated = await apiJson<UploadDocument>({
        pathOrUrl: doc.url,
        method: "PATCH",
        body: { file_type_name: key },
      });
      setUploads((prev) =>
        (prev ?? []).map((u) => (u.url === updated.url ? updated : u)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change file type");
    } finally {
      setSavingFileTypeUrl(null);
    }
  }

  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactFirst, setNewContactFirst] = useState("");
  const [newContactLast, setNewContactLast] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  /**
   * While a Celery worker is still classifying an upload, keep re-reading. Uses the same
   * reload as a background upload finishing, so a classified CSF also brings across the
   * RFC/address it filled in on the customer.
   */
  useClassificationPolling({
    documents: uploads,
    onRefresh: reloadCustomerDocuments,
  });

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {customer ? customer.name : "Customer"}
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              View and update customer profile, contacts, and uploads.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/customers"
              className="rounded-md border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-subtle"
            >
              Back
            </Link>
            <button
              type="button"
              disabled={!customer || deleting}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md border border-danger-line bg-surface px-3 py-2 text-sm font-medium text-danger hover:bg-danger-surface disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        <ConfirmDialog
          open={confirmingDelete}
          title="Delete this customer?"
          name={customer?.name}
          description="Their credit cases, contacts and uploaded documents go with them."
          busy={deleting}
          onConfirm={() => void handleDeleteCustomer()}
          onCancel={() => setConfirmingDelete(false)}
        />

        <ConfirmDialog
          open={contactToDelete !== null}
          title="Delete this contact?"
          name={contactToDelete?.email}
          busy={deletingContact}
          onConfirm={() => {
            if (contactToDelete) void handleDeleteContact(contactToDelete);
          }}
          onCancel={() => setContactToDelete(null)}
        />

        <ConfirmDialog
          open={documentToDelete !== null}
          title="Delete this document?"
          name={documentToDelete ? documentDisplayName(documentToDelete) : undefined}
          description="The uploaded file is removed from this customer."
          busy={deletingDocument}
          onConfirm={() => {
            if (documentToDelete) void handleDeleteDocument(documentToDelete);
          }}
          onCancel={() => setDocumentToDelete(null)}
        />

        {error ? (
          <div className="mt-6 rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-lg border bg-surface p-6">
            <h2 className="text-base font-semibold">Profile</h2>
            {/* Uploading a CSF fills rfc/zip/street from the document, so these fields
                can hold AI-extracted values the user never typed. */}
            <AiNotice className="mt-3" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <div className="text-sm font-medium">Name</div>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">RFC</div>
                <input
                  value={editingRfc}
                  onChange={(e) => setEditingRfc(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">ZIP</div>
                <input
                  value={editingZip}
                  onChange={(e) => setEditingZip(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <div className="text-sm font-medium">Street</div>
                <input
                  value={editingStreet}
                  onChange={(e) => setEditingStreet(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {saved && (
                <span
                  aria-live="polite"
                  className="rounded-md border border-success-line bg-success-surface px-3 py-2 text-sm text-success"
                >
                  {saved}
                </span>
              )}
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={!customer || saving || !hasUnsavedChanges}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
              >
                Discard changes
              </button>
              <button
                type="button"
                disabled={!customer || saving}
                onClick={async () => {
                  if (!customer) return;
                  setSaving(true);
                  setError(null);
                  clearSaved();
                  try {
                    const updated = await apiJson<Customer>({
                      pathOrUrl: customer.url,
                      method: "PATCH",
                      body: {
                        name: editingName.trim(),
                        rfc: editingRfc.trim() || null,
                        nombre_de_vialidad: editingStreet.trim() || null,
                        codigo_postal: editingZip.trim() || null,
                        organization: customer.organization?.url ?? organizationUrl,
                        created_by: customer.created_by?.url ?? user?.url ?? null,
                      },
                    });
                    setCustomer(updated);
                    showSaved("Saved.");
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Save failed");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <div className="mt-6 text-xs text-fg-subtle">
              Created: {customer ? formatDate(customer.created_at) : "—"} · Updated:{" "}
              {customer ? formatDate(customer.updated_at) : "—"}
            </div>
          </section>

          {/* Same shape as the credit case detail page's Required documents section:
              the upload control on top, then bordered rows with the document type on
              the right — so documents look the same wherever the user meets them. */}
          <section className="rounded-lg border bg-surface p-6">
            <h2 className="text-base font-semibold">Documents</h2>
            <p className="mt-2 text-sm text-fg-muted">
              Choosing a file uploads it straight away and links it to this customer.
              File type is detected automatically — correct it here if it&apos;s wrong.
            </p>

            <div className="mt-4">
              <FileUploadField
                // Keyed on the customer so an upload still in flight is still reported
                // as running after navigating away and back.
                scope={customer?.url}
                disabled={!customer}
                onUpload={handleUpload}
                onBackgroundUploadsSettled={() => void reloadCustomerDocuments()}
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

          {/* Same table as the /credit-cases dashboard, scoped to this customer —
              shared component, so the columns can't drift apart. */}
          <section className="lg:col-span-3 rounded-lg border bg-surface p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Credit cases</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Every credit case for this customer.
                </p>
              </div>
              <Link
                href="/credit-cases/new"
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover"
              >
                New credit case
              </Link>
            </div>

            <CreditCaseTable
              cases={creditCases}
              customersByUrl={customer ? { [customer.url]: customer } : {}}
              emptyMessage="No credit cases for this customer yet."
            />
          </section>

          <section className="lg:col-span-3 rounded-lg border bg-surface p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Contacts</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Customer contacts are unique by (organization, email).
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <label className="block sm:col-span-2">
                <div className="text-sm font-medium">Email</div>
                <input
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  type="email"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">First</div>
                <input
                  value={newContactFirst}
                  onChange={(e) => setNewContactFirst(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="text-sm font-medium">Last</div>
                <input
                  value={newContactLast}
                  onChange={(e) => setNewContactLast(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <div className="text-sm font-medium">Role</div>
                <input
                  value={newContactRole}
                  onChange={(e) => setNewContactRole(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <div className="sm:col-span-2 flex items-end justify-end">
                <button
                  type="button"
                  disabled={!customer || creatingContact}
                  onClick={async () => {
                    if (!customer) return;
                    if (!organizationUrl) {
                      setError("No organization available for this user.");
                      return;
                    }
                    if (!newContactEmail.trim()) {
                      setError("Contact email is required.");
                      return;
                    }
                    setCreatingContact(true);
                    setError(null);
                    try {
                      const created = await apiJson<CustomerContact>({
                        pathOrUrl: "/customer-contacts/",
                        method: "POST",
                        body: {
                          email: newContactEmail.trim(),
                          first_name: newContactFirst.trim() || null,
                          last_name: newContactLast.trim() || null,
                          role: newContactRole.trim() || null,
                          customer: customer.url,
                          organization: organizationUrl,
                          created_by: user?.url ?? null,
                        },
                      });
                      setContacts([...(contacts ?? []), created]);
                      setNewContactEmail("");
                      setNewContactFirst("");
                      setNewContactLast("");
                      setNewContactRole("");
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : "Create failed");
                    } finally {
                      setCreatingContact(false);
                    }
                  }}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
                >
                  {creatingContact ? "Adding…" : "Add contact"}
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm bg-surface">
                <thead className="border-b bg-surface-subtle text-left text-xs uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!contacts ? (
                    <tr>
                      <td className="px-4 py-4 text-fg-muted" colSpan={4}>
                        Loading…
                      </td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-fg-muted" colSpan={4}>
                        No contacts yet.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.url} className="hover:bg-surface-subtle">
                        <td className="px-4 py-3">
                          {(c.first_name || "") + " " + (c.last_name || "")}
                        </td>
                        <td className="px-4 py-3">{c.email}</td>
                        <td className="px-4 py-3 text-fg-muted">{c.role || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            aria-label={`Delete contact ${c.email}`}
                            className="text-sm font-medium text-danger underline"
                            onClick={() => setContactToDelete(c)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}

