/**
 * Remembering how wide a user made each table column.
 *
 * Column widths are a personal preference — one user wants the customer name wide, the
 * next cares about amounts — so the app should not keep resetting them to a global
 * default. Whatever the user last dragged becomes THEIR default.
 *
 * Kept in localStorage rather than on the account: it is a display preference, it needs
 * to apply instantly with no round trip, and it costs no backend surface. The trade-off
 * is that it does not follow the user to another browser or machine.
 */
import { getLocalStorageItem, safeJsonParse, setLocalStorageItem } from "./storage";

/** Widths in px, keyed by column id. A column with no entry uses its natural width. */
export type ColumnWidths = Record<string, number>;

/** Narrow enough to be useful, wide enough that the header controls still fit. */
export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 900;

function storageKey(tableId: string): string {
  return `tcapp.columnWidths.${tableId}`;
}

/** Clamp so a stored value can never make a column unusable. */
export function clampColumnWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

/**
 * The widths this user last chose for a table.
 *
 * Anything unparseable or out of range is dropped rather than trusted — a corrupted
 * entry would otherwise render a permanently broken table with no obvious way back.
 */
export function loadColumnWidths(tableId: string): ColumnWidths {
  const stored = safeJsonParse<unknown>(getLocalStorageItem(storageKey(tableId)));
  if (!stored || typeof stored !== "object") return {};

  const result: ColumnWidths = {};
  for (const [columnId, width] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof width === "number" && Number.isFinite(width)) {
      result[columnId] = clampColumnWidth(width);
    }
  }
  return result;
}

/** Persist the widths as this user's new default for the table. */
export function saveColumnWidths(tableId: string, widths: ColumnWidths): void {
  setLocalStorageItem(storageKey(tableId), JSON.stringify(widths));
}
