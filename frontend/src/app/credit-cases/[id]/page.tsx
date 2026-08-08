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
import { RequireAuth } from "@/components/RequireAuth";
import { apiForm, apiJson, ApiError, drfListAll } from "@/lib/api";
import {
  CREDIT_CASE_STATUS_LABELS,
  FILE_TYPE_NAME_LABELS,
  REQUESTED_TERM_DAYS_OPTIONS,
} from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { CreditCase, Customer, UploadDocument, User } from "@/lib/types";

function fileTypeLabel(fileTypeName: string | null | undefined): string {
  if (!fileTypeName) return "Pending classification";
  return FILE_TYPE_NAME_LABELS[fileTypeName] ?? fileTypeName;
}

export default function CreditCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [creditCase, setCreditCase] = useState<CreditCase | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requestedAmount, setRequestedAmount] = useState("");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  const [currency, setCurrency] = useState("MXN");
  const [status, setStatus] = useState("missing_documents");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [users, setUsers] = useState<User[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshingUploads, setRefreshingUploads] = useState(false);

  const loadUploads = useCallback(async (creditCaseUrl: string) => {
    const allUploads = await drfListAll<UploadDocument>({
      path: "/upload-documents/",
    });
    return allUploads.filter((u) => u.credit_case === creditCaseUrl);
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
        setAssignedTo(cc.assigned_to ?? "");
        setUsers(allUsers);

        const cust = await apiJson<Customer>({ pathOrUrl: cc.customer });
        if (cancelled) return;
        setCustomer(cust);

        const caseUploads = await loadUploads(cc.url);
        if (cancelled) return;
        setUploads(caseUploads);
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
      label: FILE_TYPE_NAME_LABELS[fileType] ?? fileType,
      satisfied: uploadedTypeNames.has(fileType),
    }));
  }, [creditCase?.required_file_type_names, uploadedTypeNames]);

  async function refreshUploads() {
    if (!creditCase) return;
    setRefreshingUploads(true);
    setError(null);
    try {
      const caseUploads = await loadUploads(creditCase.url);
      setUploads(caseUploads);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to refresh uploads");
    } finally {
      setRefreshingUploads(false);
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
              onClick={async () => {
                if (!creditCase) return;
                setDeleting(true);
                setError(null);
                try {
                  await apiJson<void>({
                    pathOrUrl: creditCase.url,
                    method: "DELETE",
                  });
                  router.push("/credit-cases");
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
                  Verdict
                </div>
                <div className="mt-1 font-medium capitalize">
                  {creditCase?.verdict ?? "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium">Status</div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={!creditCase}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-60"
                >
                  {Object.entries(CREDIT_CASE_STATUS_LABELS).map(([value, label]) => (
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

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                disabled={!creditCase || saving}
                onClick={async () => {
                  if (!creditCase) return;
                  setSaving(true);
                  setError(null);
                  try {
                    const updated = await apiJson<CreditCase>({
                      pathOrUrl: creditCase.url,
                      method: "PATCH",
                      body: {
                        requested_amount: requestedAmount.trim() || null,
                        currency,
                        requested_term_days: Number(requestedTermDays),
                        customer: creditCase.customer,
                        status,
                        assigned_to: assignedTo || null,
                      },
                    });
                    setCreditCase(updated);
                    setStatus(updated.status ?? "missing_documents");
                    setAssignedTo(updated.assigned_to ?? "");
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
            <h2 className="text-base font-semibold">Required documents</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Default requirements for this credit case. Upload files below; the
              backend classifies each file after upload.
            </p>

            <ul className="mt-4 space-y-2">
              {requiredFileStatuses.map((req) => (
                <li
                  key={req.fileType}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>{req.label}</span>
                  <span
                    className={
                      req.satisfied
                        ? "text-xs font-medium text-green-700"
                        : "text-xs font-medium text-amber-700"
                    }
                  >
                    {req.satisfied ? "Uploaded" : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="lg:col-span-3 rounded-lg border bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Upload files</h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Upload one or more files linked to this credit case and customer.
                  File type is detected automatically after upload.
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

            <div className="mt-4 space-y-3">
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm"
              />
              {files.length > 0 ? (
                <div className="text-xs text-zinc-500">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </div>
              ) : null}
              <button
                type="button"
                disabled={!creditCase || !customer || files.length === 0 || uploading}
                onClick={async () => {
                  if (!creditCase || !customer || files.length === 0) return;
                  setUploading(true);
                  setError(null);
                  try {
                    const createdBatches = await Promise.all(
                      files.map(async (file) => {
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
                    const created = createdBatches.flat();
                    setUploads([...(uploads ?? []), ...created]);
                    setFiles([]);
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{u.original_title}</div>
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                        {fileTypeLabel(u.file_type_name)}
                      </span>
                    </div>
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
        </div>
      </RequireAuth>
    </AppShell>
  );
}
