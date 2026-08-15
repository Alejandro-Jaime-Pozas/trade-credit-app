"use client";

/**
 * "Are you sure?" before something irreversible.
 *
 * Every delete/remove in the app goes through this. Deletes were previously one
 * unguarded click, so a misclick destroyed a credit case, a customer and its whole
 * history, or a contact, with no way back — none of these are undoable.
 *
 * Built on `Modal`, so it inherits Escape / ✕ / backdrop dismissal. All three of those
 * land on Cancel, which is the safe answer: dismissing a confirmation must never be
 * read as consent.
 *
 * `name` is rendered on its own line rather than glued into the question, so the user
 * can see exactly WHICH record they are about to destroy before agreeing.
 */
import React from "react";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export function ConfirmDialog(props: {
  /** Renders nothing when false, so callers can keep this mounted unconditionally. */
  open: boolean;
  title: string;
  /** What the user is about to lose, e.g. "Acme Corp" or "statement.pdf". */
  name?: string | null;
  /** Extra warning about knock-on effects, e.g. related records going with it. */
  description?: React.ReactNode;
  /** The destructive button's label, e.g. "Delete" or "Remove". */
  confirmLabel?: string;
  /** Label while the action is running. */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const {
    open,
    title,
    name,
    description,
    confirmLabel = "Delete",
    busyLabel = "Deleting…",
    busy = false,
    onConfirm,
    onCancel,
  } = props;

  if (!open) return null;

  return (
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
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy && <Spinner />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      {name && (
        <p className="mt-3 rounded-md border bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900">
          {name}
        </p>
      )}
      {description && <div className="mt-3 text-sm text-zinc-600">{description}</div>}
      <p className="mt-3 text-sm text-zinc-600">This can&apos;t be undone.</p>
    </Modal>
  );
}
