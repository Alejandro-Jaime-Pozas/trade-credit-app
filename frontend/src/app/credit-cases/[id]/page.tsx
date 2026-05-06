"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { apiForm, apiJson, ApiError, drfListAll } from "@/lib/api";
import type { CreditCase, Customer, UploadDocument } from "@/lib/types";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

export default function CreditCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [creditCase, setCreditCase] = useState<CreditCase | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [uploads, setUploads] = useState<UploadDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requestedAmount, setRequestedAmount] = useState("0.00");
  const [requestedTermDays, setRequestedTermDays] = useState("30");
  const [currency, setCurrency] = useState("MXN");

  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const cc = await apiJson<CreditCase>({ pathOrUrl: `/credit-cases/${id}/` });
        if (cancelled) return;
        setCreditCase(cc);
        setRequestedAmount(cc.requested_amount ?? "0.00");
        setRequestedTermDays(String(cc.requested_term_days ?? 30));
        setCurrency(cc.currency ?? "MXN");

        const cust = await apiJson<Customer>({ pathOrUrl: cc.customer });
        if (cancelled) return;
        setCustomer(cust);

        const allUploads = await drfListAll<UploadDocument>({
          path: "/upload-documents/",
        });
        if (cancelled) return;
        setUploads(allUploads.filter((u) => u.credit_case === cc.url));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load credit case");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <AppShell>
      <RequireAuth>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Credit case {creditCase ? `#${creditCase.id}` : ""}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              View and update basic request fields, and upload files.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Back
          </Link>
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
                  Status / Verdict
                </div>
                <div className="mt-1 font-medium">
                  {creditCase ? `${creditCase.status} / ${creditCase.verdict}` : "—"}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium">Requested amount</div>
                <input
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
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
                  <option value="USD">USD</option>
                </select>
              </label>
              <label className="block">
                <div className="text-sm font-medium">Requested term (days)</div>
                <input
                  value={requestedTermDays}
                  onChange={(e) => setRequestedTermDays(e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
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
                        requested_amount: requestedAmount,
                        currency,
                        requested_term_days: Number(requestedTermDays),
                        customer: creditCase.customer,
                      },
                    });
                    setCreditCase(updated);
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
            <h2 className="text-base font-semibold">Upload files</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Upload a file and link it to this credit case.
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm"
              />
              <button
                type="button"
                disabled={!creditCase || !file || uploading}
                onClick={async () => {
                  if (!creditCase || !file) return;
                  setUploading(true);
                  setError(null);
                  try {
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("credit_case", creditCase.url);
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
        </div>
      </RequireAuth>
    </AppShell>
  );
}

