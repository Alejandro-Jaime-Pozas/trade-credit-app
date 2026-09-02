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
 * Shown from every place the default can be changed — the Requirements page, the last
 * step of creating a credit case, and the requirement editor on a credit case's own
 * detail page — so they all behave identically. The wording of the three choices is
 * overridable because the detail page is deciding about one case as well as the rest;
 * the choices themselves are not, because they are the same three choices.
 *
 * Nothing has been written when this appears. Cancel is the do-nothing option in the
 * literal sense: it sends no request at all.
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
import { fileTypeDisplayLabel } from "@/lib/fileTypes";
import type { TemplateImpactEntry } from "@/lib/fileTypes";

export function ImpactWarning(props: {
  entries: TemplateImpactEntry[];
  /** An action is in flight. */
  busy: boolean;
  /** Save the change and push it onto the listed open cases. */
  onApply: () => void;
  /** Save the change, but leave the listed open cases on the list they have. */
  onKeep: () => void;
  /** Abandon it. Writes nothing. */
  onCancel: () => void;
  title?: string;
  /** Replaces the default explanatory line above the list of cases. */
  intro?: React.ReactNode;
  applyLabel?: string;
  keepLabel?: string;
}) {
  const {
    entries,
    busy,
    onApply,
    onKeep,
    onCancel,
    title = "Update credit cases already in progress?",
    intro,
    applyLabel = "Update these cases",
    keepLabel = "Keep them as they are",
  } = props;

  return (
    // Dismissing (Escape, ✕, backdrop) is CANCEL, not keep: the user never confirmed
    // this change, so backing out must leave everything exactly as it was. The middle
    // choice is the deliberate third option — it accepts the change and only spares the
    // open cases.
    <Modal
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-surface-subtle disabled:opacity-60"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Working…" : applyLabel}
          </button>
        </>
      }
    >
        <p className="mt-2 text-sm text-fg-muted">
          {intro ?? (
            <>
              Your default list changed. These {entries.length} open credit case
              {entries.length === 1 ? "" : "s"} still use the old one. Submitted cases
              are never changed.
            </>
          )}
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
                <p className="mt-1 text-success">
                  + {entry.adds.map(fileTypeDisplayLabel).join(", ")}
                </p>
              )}
              {entry.removes.length > 0 && (
                <p className="mt-1 text-warning">
                  − {entry.removes.map(fileTypeDisplayLabel).join(", ")}
                </p>
              )}
              {entry.removes_with_uploads.length > 0 && (
                <p className="mt-1 text-danger">
                  Already uploaded, will stop counting:{" "}
                  {entry.removes_with_uploads.map(fileTypeDisplayLabel).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
    </Modal>
  );
}
