"use client";

/**
 * Edit a money amount. The ONLY way money is typed in this app.
 *
 * The hard part of a formatted money field is the caret: grouping the digits on every
 * keystroke moves the text under the cursor, so the cursor has to be put back by hand,
 * and paste / select-all / deleting a separator each become their own edge case.
 *
 * This sidesteps all of it by changing shape at the edges of editing rather than during
 * it:
 *
 *   not focused   1,500,000.00   grouped, easy to read and compare
 *   focused       1500000.00     plain, so typing behaves like a normal number field
 *   on blur       1,500,000.00   grouped again, and normalised to 2 decimals
 *
 * `onChange` always reports the CANONICAL decimal string (`"1500000.00"`) — never the
 * grouped text — so callers can hand it straight to the API. See `lib/money.ts` for why
 * that value stays a string.
 */
import React, { useState } from "react";
import {
  formatAmountGrouped,
  normalizeAmount,
  sanitizeMoneyTyping,
  toEditableAmount,
} from "@/lib/money";

export function MoneyInput(props: {
  /** The stored amount, as the API sends it. */
  value: string | null | undefined;
  /** Reports the canonical decimal string, or `""` when the field is cleared. */
  onChange: (canonical: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const {
    value,
    onChange,
    disabled = false,
    placeholder = "0.00",
    className = "",
    id,
    "aria-label": ariaLabel,
  } = props;

  /**
   * What the user is typing, or `null` when they aren't editing.
   *
   * Held separately from `value` rather than synced to it in an effect: an effect would
   * repaint the field a frame late, and `react-hooks/set-state-in-effect` rightly rejects
   * the synchronous setState that would avoid that. Deriving the displayed text instead
   * needs no effect at all.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const displayed = draft ?? formatAmountGrouped(value);

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      // `decimal` asks a phone for the numeric keypad. Not `type="number"`, which brings
      // spinners, scroll-wheel edits, and a `value` that browsers may reformat on their
      // own terms.
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      placeholder={placeholder}
      value={displayed}
      onFocus={() => setDraft(toEditableAmount(value))}
      onChange={(e) => {
        const typed = sanitizeMoneyTyping(e.target.value);
        setDraft(typed);
        // Reported on every keystroke so the parent's unsaved-changes check stays live.
        onChange(normalizeAmount(typed));
      }}
      onBlur={() => {
        onChange(normalizeAmount(draft ?? ""));
        // Dropping the draft hands display back to the grouped form.
        setDraft(null);
      }}
      className={["tabular-nums", className].join(" ")}
    />
  );
}
