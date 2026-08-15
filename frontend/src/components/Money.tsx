/**
 * Display a money amount. The ONLY way money is rendered read-only in this app.
 *
 * A component rather than a bare `formatMoney(...)` call so there is one obvious thing
 * to reach for. Amounts were previously formatted at whichever call site remembered to,
 * which is how the dashboard ended up showing `MXN 1,500,000.00` while the detail page
 * showed `1500000.00`.
 *
 * `currency` comes from the record, not a constant: the field varies per credit case even
 * though only MXN is offered today.
 */
import { formatMoney } from "@/lib/format";

export function Money({
  value,
  currency,
  className = "",
}: {
  /** A decimal amount as the API sends it, e.g. `"1500000.00"`. */
  value: string | number | null | undefined;
  /** ISO code from the same record, e.g. `"MXN"`. Omit to show the number alone. */
  currency?: string | null;
  className?: string;
}) {
  return (
    // `tabular-nums` gives every digit the same width, so amounts line up down a column
    // instead of wandering.
    <span className={["tabular-nums", className].join(" ")}>
      {formatMoney(value, currency)}
    </span>
  );
}
