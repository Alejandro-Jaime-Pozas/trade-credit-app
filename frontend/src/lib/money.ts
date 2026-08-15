/**
 * The one place that knows how money is written, parsed and stored.
 *
 * THE RULE: a money amount is a plain decimal STRING everywhere it travels —
 * `"1500000.00"` — exactly as the backend serializes it. DRF sends decimals as strings
 * on purpose, because a JS number cannot represent every decimal exactly, and rounding
 * drift in a credit limit is a real cost rather than a cosmetic bug. Convert to a number
 * only to display or to sort, never on the way back to the API.
 *
 * Two shapes exist for one value, and keeping them apart is what makes the input usable:
 *
 *   canonical  "1500000.00"    what the API sends and receives
 *   grouped    "1,500,000.00"  what a person reads
 *
 * Display goes through `<Money>`; editing goes through `<MoneyInput>`. Nothing else
 * should be formatting or parsing an amount by hand — see `money.enforcement.test.ts`,
 * which fails the build if something starts to.
 */

/**
 * Locale for every money amount in the app.
 *
 * es-MX groups with commas and separates decimals with a dot, which is what the app's
 * users expect. Defined once here so making it follow the signed-in user later is a
 * single change rather than a hunt.
 */
export const MONEY_LOCALE = "es-MX";

/** Money is stored and shown to two decimal places throughout. */
export const MONEY_DECIMALS = 2;

/**
 * Cut a typed string down to something that can still become a valid amount.
 *
 * Run on every keystroke, so it has to tolerate half-finished input — `"1500."` and
 * `"-"` are on the way to being valid and must survive. Grouping separators and currency
 * symbols are stripped rather than rejected, so pasting `"$1,500,000.00"` works.
 */
export function sanitizeMoneyTyping(raw: string): string {
  const negative = raw.trim().startsWith("-");

  // Everything that isn't a digit or a decimal point is noise: separators, symbols,
  // spaces, and any minus signs after the first character.
  let cleaned = raw.replace(/[^\d.]/g, "");

  // Only the first decimal point counts; later ones are dropped rather than rejected,
  // so a stray keypress doesn't wipe what was typed.
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  const [whole, decimals] = cleaned.split(".");
  const trimmedDecimals =
    decimals === undefined ? undefined : decimals.slice(0, MONEY_DECIMALS);

  const body =
    trimmedDecimals === undefined ? whole : `${whole}.${trimmedDecimals}`;

  return negative && body !== "" ? `-${body}` : negative ? "-" : body;
}

/**
 * Tidy a finished amount into its canonical form, ready for the API.
 *
 * Run when editing ends, not while typing — `"1500."` becoming `"1500.00"` mid-keystroke
 * would fight the user. Returns `""` for anything that never became a number, which
 * callers send as null.
 */
export function normalizeAmount(raw: string): string {
  const cleaned = sanitizeMoneyTyping(raw);
  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return "";
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return "";

  // toFixed is safe here: the value has already been limited to two decimals, so this
  // pads rather than rounds, and cannot introduce drift.
  return value.toFixed(MONEY_DECIMALS);
}

/** A stored amount as plain editable text — no grouping to fight the caret. */
export function toEditableAmount(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  return sanitizeMoneyTyping(String(amount));
}

/** Parse a stored amount to a number, for display and sorting only. Never for the API. */
export function parseAmount(amount: string | number | null | undefined): number | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const value = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(value) ? value : null;
}

/**
 * A grouped amount WITHOUT its currency code, e.g. `"1,500,000.00"`.
 *
 * Used inside the edit field, where the currency is already chosen in its own control
 * next to it and repeating the code in the box would just be noise.
 */
export function formatAmountGrouped(
  amount: string | number | null | undefined,
): string {
  const value = parseAmount(amount);
  if (value === null) return "";
  return new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  }).format(value);
}
