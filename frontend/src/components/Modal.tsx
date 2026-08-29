"use client";

/**
 * The app's dialog shell: backdrop, panel, title, and a close affordance.
 *
 * Exists so every modal dismisses the same way. Previously each one hand-rolled its
 * markup and none of them listened for Escape, so a dialog could only be dismissed by
 * finding the right button — and the requirements dialog offered no obvious cancel at all.
 *
 * Three ways out, all wired here once:
 *   - Escape
 *   - the ✕ in the corner
 *   - clicking the backdrop outside the panel
 *
 * `onClose` is the *cancel* path, so it must be the harmless one. A dialog whose
 * dismissal would lose work should pass a confirm step, not rely on this.
 */
import React, { useCallback, useEffect, useRef } from "react";

export function Modal(props: {
  title: string;
  onClose: () => void;
  /** Disables every dismissal route while an action is in flight. */
  busy?: boolean;
  children: React.ReactNode;
  /** Buttons for the footer, rendered right-aligned. */
  footer?: React.ReactNode;
}) {
  const { title, onClose, busy = false, children, footer } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/70"
      onMouseDown={(e) => {
        // Only a press that starts on the backdrop itself counts. Without this check a
        // drag that began inside the panel and released outside would close it.
        if (!panelRef.current?.contains(e.target as Node)) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md px-2 py-1 text-lg leading-none text-fg-subtle hover:bg-surface-muted hover:text-fg disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {children}

        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
