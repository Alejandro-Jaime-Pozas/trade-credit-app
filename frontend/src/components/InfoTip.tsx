"use client";

/**
 * A small icon that explains itself on hover or focus.
 *
 * Two jobs on the credit case detail page, and they are the same job: say something the
 * user only occasionally needs, without spending permanent screen space on it.
 *
 * - `tone="info"` — the paragraph that used to sit under "Verdict deadline (days)".
 * - `tone="custom"` — the blue marker on a field the organization defined itself, so a
 *   custom field is distinguishable from a built-in one at a glance.
 *
 * Hand-built rather than pulled from a library because the project ships zero UI
 * dependencies. The bubble is shown on `:hover` AND on `:focus-within`, so it is reachable
 * with a keyboard; `aria-label` carries the same text, so a screen reader gets it from the
 * button itself and never depends on the bubble being visible at all.
 */
import React from "react";

export function InfoTip(props: {
  /** The text shown in the bubble, and the button's accessible name. */
  text: string;
  tone?: "info" | "custom";
  className?: string;
}) {
  const { text, tone = "info", className = "" } = props;

  return (
    <span className={`group relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={text}
        // Not a tab stop: it carries no action, and on a page with a dozen fields these
        // would double the number of stops between a user and the Save button. Hovering
        // reveals it, and its aria-label is read out wherever it is announced.
        tabIndex={-1}
        className={[
          "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none",
          tone === "custom"
            ? "bg-accent text-accent-fg"
            : "border border-fg-faint text-fg-subtle",
        ].join(" ")}
      >
        <span aria-hidden="true">{tone === "custom" ? "★" : "i"}</span>
      </button>

      {/* `pointer-events-none` so the bubble can never sit between the cursor and
          whatever is underneath it. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 hidden w-56 -translate-x-1/2 rounded-md border bg-surface px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-fg-secondary shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
