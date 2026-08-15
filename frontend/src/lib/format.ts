/**
 * Shared display formatters for dates and money amounts.
 *
 * `formatMoney` is deliberately not called directly from pages — render money through
 * the `<Money>` component instead, so every amount in the app is formatted the same way.
 * See `lib/money.ts`.
 */
import { MONEY_DECIMALS, MONEY_LOCALE } from "./money";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

/**
 * Formats a DRF decimal (serialized as a string) as a comma-grouped money
 * amount, e.g. `formatMoney("1500000.00", "MXN")` -> "MXN 1,500,000.00".
 *
 * Uses `currencyDisplay: "code"` to keep the explicit ISO code the app
 * already shows, rather than switching to a currency symbol.
 */
export function formatMoney(
  amount: string | number | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined) return "—";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(value)) return "—";

  if (currency) {
    try {
      return new Intl.NumberFormat(MONEY_LOCALE, {
        style: "currency",
        currency,
        currencyDisplay: "code",
        minimumFractionDigits: MONEY_DECIMALS,
      }).format(value);
    } catch {
      // Intl throws on an unrecognized/malformed currency code (e.g. bad
      // data). Fall back to a plain grouped number with the raw code.
    }
  }

  const grouped = new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: MONEY_DECIMALS,
  }).format(value);
  return currency ? `${currency} ${grouped}` : grouped;
}
