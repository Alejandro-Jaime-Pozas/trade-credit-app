/**
 * Pure, dependency-free CSV export helpers.
 *
 * Used by the credit cases dashboard to let a user download exactly the rows
 * they're currently looking at — after their filters and sort from
 * `tableControls.ts` have been applied — as a CSV file Excel can open
 * cleanly, with Spanish text rendering correctly and no formula surprises.
 *
 * Everything here is free of React, and only `downloadCsv` touches the DOM
 * (and even that is guarded), so the CSV-shaping logic is easy to
 * unit-test and safe to import from anywhere, including a server component.
 */

// ── Rendering rows to CSV ───────────────────────────────────────────

/**
 * Describes one column of the exported CSV: what its header text is, and how
 * to read a cell's value out of a row. `value` may return null/undefined for
 * a row with nothing to show there — those become empty cells, not the text
 * "null" or "undefined".
 */
export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => string | number | null | undefined;
};

/**
 * Escapes one field per RFC 4180: wraps it in double quotes when it contains
 * a comma, a double quote, or a newline (those would otherwise be read as
 * field/row separators or corrupt the row), or when it has leading/trailing
 * whitespace (which an unquoted cell would silently lose when the file is
 * opened, since whitespace outside quotes isn't part of the RFC 4180
 * grammar). Any quote already inside the field is doubled so a reader can
 * tell it apart from the quotes wrapping the field.
 */
function escapeField(raw: string): string {
  const needsQuoting = /["\r\n,]/.test(raw) || raw !== raw.trim();
  if (!needsQuoting) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Neutralises formula / "CSV injection" attacks: if a field's text starts
 * with =, +, -, or @, Excel and Google Sheets can read the whole cell as a
 * formula instead of plain text when the file is opened, and formulas can
 * call out to other cells or even the OS. This isn't hypothetical here —
 * a user-typed custom-field value flows straight into this export, so any
 * user who can type the first character of a field controls whether it
 * looks like a formula. Prefixing a literal single quote is the standard
 * fix: spreadsheets treat a leading `'` as "force this to render as text"
 * and don't display the quote itself.
 */
function neutralizeFormula(raw: string): string {
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

/**
 * Converts one cell's value to its final CSV text, empty/escaped/neutralised as needed.
 *
 * The formula guard is applied to STRINGS ONLY. A number reaching this function came from
 * the calling code, not from anything a user typed, so it is not an injection risk — and
 * guarding it would actively break the export, since a negative number like a "days left"
 * of -3 starts with `-` and would arrive in Excel as the text `-3` instead of a number the
 * reader can sort or total.
 */
function formatField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return escapeField(String(value));
  return escapeField(neutralizeFormula(value));
}

/**
 * Renders `rows` to an RFC 4180 CSV string, with the column headers as the
 * first line. Always includes the header line, even for an empty `rows`
 * array, so an export with no matching rows still opens as a recognisable
 * (empty) spreadsheet rather than a blank file.
 *
 * Rows are joined with \r\n rather than a bare \n because Excel — the
 * export's target consumer — is the CSV reader most likely to mis-parse a
 * file that uses only \n line endings.
 *
 * A UTF-8 byte-order-mark is prepended even though it isn't part of the CSV
 * grammar itself: this app's data is Spanish (acentos, "Pagaré", "MTY
 * Norte"), and Excel on Windows guesses a file's encoding from its first
 * bytes, defaulting to a legacy codepage that mangles accented characters
 * when there's no BOM to tell it "this is UTF-8". Without this line the
 * export looks broken in a way that's easy to mistake for a data bug.
 */
export function toCsv<Row>(rows: Row[], columns: CsvColumn<Row>[]): string {
  const BOM = "﻿";
  const headerLine = columns.map((column) => escapeField(column.header)).join(",");
  const rowLines = rows.map((row) =>
    columns.map((column) => formatField(column.value(row))).join(","),
  );
  return BOM + [headerLine, ...rowLines].join("\r\n");
}

// ── Filename ─────────────────────────────────────────────────────────

/**
 * Builds a dated export filename, e.g. `csvFilename("credit-cases")` ->
 * `"credit-cases-2026-08-31.csv"`.
 *
 * Reads the LOCAL date parts off `now` rather than using
 * `now.toISOString()` (which is always UTC): a user west of UTC can already
 * be on a different local calendar date than UTC is — e.g. 11pm on the 31st
 * locally is already the 1st in UTC — and a downloaded file dated
 * "tomorrow" from the user's own point of view would just be confusing.
 */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${prefix}-${year}-${month}-${day}.csv`;
}

// ── Triggering the download ─────────────────────────────────────────

/**
 * Triggers a browser download of `csv` as `filename`, using the standard
 * "invisible link with a `download` attribute" trick — there's no simpler
 * built-in browser API for saving a string to a file.
 *
 * Guarded on `document` existing so this module stays safe to *import* (and
 * even call, harmlessly) from a server component or a test environment
 * without a DOM — it just does nothing there instead of throwing.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Firefox requires the link to be in the document for `.click()` to work.
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the blob URL now that the download has been handed off, so it
  // doesn't sit in memory for the rest of the page's life.
  URL.revokeObjectURL(url);
}
