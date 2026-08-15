"use client";

/**
 * Asks what to do with credit cases already in progress after the organization's default
 * required documents changed.
 *
 * Changing the default does NOT change existing cases on its own: each case holds its own
 * copy of what it requires, so a case already under review keeps reporting what it was
 * actually judged against. This is the moment the user decides whether to bring open cases
 * in line or leave them as they are.
 *
 * Shown from both places the default can be changed — the Requirements page and the last
 * step of creating a credit case — so the two behave identically.
 *
 * Deliberately lists what changes per case rather than just a count, especially
 * `removes_with_uploads`: documents the customer has already sent that would stop counting
 * toward anything. That is the detail a user needs before confirming, not after.
 *
 * Cases already submitted for approval never appear here — the backend excludes them,
 * because their requirement list is the evidence their reviewer is working from.
 */
import Link from "next/link";
import React from "react";
import { Modal } from "./Modal";
import type { TemplateImpactEntry } from "@/lib/fileTypes";

export function ImpactWarning(props: {
  entries: TemplateImpactEntry[];
  /** An action is in flight — either applying or undoing. */
  busy: boolean;
  /** Push the new default onto the listed open cases. */
  onApply: () => void;
  /** Keep the new default, but leave the open cases on the old list. */
  onKeep: () => void;
  /** Abandon the whole thing: put the default back the way it was. */
  onCancel: () => void;
}) {
  const { entries, busy, onApply, onKeep, onCancel } = props;

  return (
    // Dismissing (Escape, ✕, backdrop) is CANCEL, not keep: the user never confirmed
    // this change, so backing out has to undo the saved default rather than quietly
    // leave it in place. "Keep them as they are" is a deliberate third choice —
    // it accepts the new default and only spares the open cases.
    <Modal
      title="Update credit cases already in progress?"
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            Keep them as they are
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Working…" : "Update these cases"}
          </button>
        </>
      }
    >
        <p className="mt-2 text-sm text-zinc-600">
          Your default list changed. These {entries.length} open credit case
          {entries.length === 1 ? "" : "s"} still use the old one. Submitted cases are
          never changed.
        </p>

        <ul className="mt-4 space-y-3">
          {entries.map((entry) => (
            <li key={entry.credit_case_id} className="rounded-md border p-3 text-sm">
              <Link
                href={`/credit-cases/${entry.credit_case_id}`}
                className="font-medium underline"
              >
                {entry.customer_name} #{entry.credit_case_id}
              </Link>

              {entry.adds.length > 0 && (
                <p className="mt-1 text-green-800">
                  + {entry.adds.map((f) => f.label_en).join(", ")}
                </p>
              )}
              {entry.removes.length > 0 && (
                <p className="mt-1 text-amber-800">
                  − {entry.removes.map((f) => f.label_en).join(", ")}
                </p>
              )}
              {entry.removes_with_uploads.length > 0 && (
                <p className="mt-1 text-red-800">
                  Already uploaded, will stop counting:{" "}
                  {entry.removes_with_uploads.map((f) => f.label_en).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
    </Modal>
  );
}
