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
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiForm, apiJson, ApiError, drfListAll } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Customer, CustomerContact, UploadDocument } from "@/lib/types";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const id = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[] | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState("");
  const [editingRfc, setEditingRfc] = useState("");
  const [editingStreet, setEditingStreet] = useState("");
  const [editingZip, setEditingZip] = useState("");

  const organizationUrl = useMemo(() => user?.organizations?.[0] ?? null, [user]);

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
        setContacts(allContacts.filter((c) => c.customer === cust.url));

        const allUploads = await drfListAll<UploadDocument>({
          path: "/upload-documents/",
        });
        if (cancelled) return;
        setUploads(allUploads.filter((u) => u.customer === cust.url));
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
  const [deleting, setDeleting] = useState(false);

  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactFirst, setNewContactFirst] = useState("");
  const [newContactLast, setNewContactLast] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {customer ? customer.name : "Customer"}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              View and update customer profile, contacts, and uploads.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/customers"
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Back
            </Link>
            <button
              type="button"
              disabled={!customer || deleting}
              onClick={async () => {
                if (!customer) return;
                setDeleting(true);
                setError(null);
                try {
                  await apiJson<void>({
                    pathOrUrl: customer.url,
                    method: "DELETE",
                  });
                  router.push("/customers");
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Delete failed");
                  setDeleting(false);
                }
              }}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-lg border bg-white p-6">
            <h2 className="text-base font-semibold">Profile</h2>
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

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                disabled={!customer || saving}
                onClick={async () => {
                  if (!customer) return;
                  setSaving(true);
                  setError(null);
                  try {
                    const updated = await apiJson<Customer>({
                      pathOrUrl: customer.url,
                      method: "PATCH",
                      body: {
                        name: editingName.trim(),
                        rfc: editingRfc.trim() || null,
                        nombre_de_vialidad: editingStreet.trim() || null,
                        codigo_postal: editingZip.trim() || null,
                        organization: customer.organization ?? organizationUrl,
                        created_by: customer.created_by ?? user?.url ?? null,
                      },
                    });
                    setCustomer(updated);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Save failed");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <div className="mt-6 text-xs text-zinc-500">
              Created: {customer ? formatDate(customer.created_at) : "—"} · Updated:{" "}
              {customer ? formatDate(customer.updated_at) : "—"}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-6">
            <h2 className="text-base font-semibold">Uploads</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Upload a file and link it to this customer.
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              <button
                type="button"
                disabled={!customer || !file || uploading}
                onClick={async () => {
                  if (!customer || !file) return;
                  setUploading(true);
                  setError(null);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("customer", customer.url);
                    const created = await apiForm<UploadDocument[]>({
                      pathOrUrl: "/upload-documents/",
                      method: "POST",
                      form: fd,
                    });
                    setUploads([...(uploads ?? []), ...created]);
                    setFile(null);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : "Upload failed");
                  } finally {
                    setUploading(false);
                  }
                }}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {!uploads ? (
                <div className="text-sm text-zinc-600">Loading…</div>
              ) : uploads.length === 0 ? (
                <div className="text-sm text-zinc-600">No uploads yet.</div>
              ) : (
                uploads.map((u) => (
                  <div key={u.url} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">{u.original_title}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {u.mimetype} · {formatDate(u.uploaded_at)}
                    </div>
                    <a
                      href={u.file}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-medium text-zinc-900 underline"
                    >
                      Download
                    </a>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="lg:col-span-3 rounded-lg border bg-white p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Contacts</h2>
                <p className="mt-2 text-sm text-zinc-600">
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
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {creatingContact ? "Adding…" : "Add contact"}
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-lg border">
              <table className="min-w-full text-sm bg-white">
                <thead className="border-b bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-600">
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
                      <td className="px-4 py-4 text-zinc-600" colSpan={4}>
                        Loading…
                      </td>
                    </tr>
                  ) : contacts.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-zinc-600" colSpan={4}>
                        No contacts yet.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((c) => (
                      <tr key={c.url} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          {(c.first_name || "") + " " + (c.last_name || "")}
                        </td>
                        <td className="px-4 py-3">{c.email}</td>
                        <td className="px-4 py-3 text-zinc-600">{c.role || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="text-sm font-medium text-red-700 underline"
                            onClick={async () => {
                              setError(null);
                              try {
                                await apiJson<void>({
                                  pathOrUrl: c.url,
                                  method: "DELETE",
                                });
                                setContacts((prev) =>
                                  (prev ?? []).filter((x) => x.url !== c.url),
                                );
                              } catch (err) {
                                setError(
                                  err instanceof ApiError ? err.message : "Delete failed",
                                );
                              }
                            }}
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

