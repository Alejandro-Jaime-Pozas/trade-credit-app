/**
 * Remembering the order a user put things in, and which ones they hid.
 *
 * Two places need the same thing: the dashboard's table columns, and the field cards in
 * the Details section of a credit case. Both are lists the user rearranges to suit how
 * they work, and both should still be that way tomorrow.
 *
 * Kept in localStorage for the same reasons as `columnWidths.ts`: it is a display
 * preference, it has to apply on the first paint with no round trip, and it costs no
 * backend surface. The trade-off is the same too — it does not follow the user to
 * another browser or machine.
 *
 * The functions here are pure so the interesting decisions (what happens to an id that
 * no longer exists, where a brand new one lands) are unit-testable without a DOM.
 */
import { getLocalStorageItem, safeJsonParse, setLocalStorageItem } from "./storage";

/**
 * One list's saved arrangement.
 *
 * `order` holds ids the user has actually arranged. It is deliberately NOT required to
 * be complete: an id missing from it is new since they last touched the list.
 */
export type LayoutPrefs = {
  order: string[];
  hidden: string[];
};

export const EMPTY_LAYOUT: LayoutPrefs = { order: [], hidden: [] };

function storageKey(listId: string): string {
  return `tcapp.layout.${listId}`;
}

/** Keep only strings, and only one of each — a stored duplicate would render twice. */
function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && entry !== "") seen.add(entry);
  }
  return Array.from(seen);
}

/**
 * The arrangement this user last chose for a list.
 *
 * Anything unparseable is dropped rather than trusted: a corrupted entry would otherwise
 * render a permanently broken table with no obvious way back.
 */
export function loadLayout(listId: string): LayoutPrefs {
  const stored = safeJsonParse<unknown>(getLocalStorageItem(storageKey(listId)));
  if (!stored || typeof stored !== "object") return EMPTY_LAYOUT;

  const record = stored as Record<string, unknown>;
  return { order: cleanIds(record.order), hidden: cleanIds(record.hidden) };
}

/** Persist an arrangement as this user's new default for the list. */
export function saveLayout(listId: string, prefs: LayoutPrefs): void {
  setLocalStorageItem(storageKey(listId), JSON.stringify(prefs));
}

/**
 * Put items into the user's order, with anything new at the end.
 *
 * Two cases matter and are easy to get wrong:
 *
 * - An id in `order` that no longer exists (a custom field someone deleted) is skipped.
 *   Left in, it would either crash a lookup or leave a phantom column.
 * - An id NOT in `order` is appended in its natural position relative to the other
 *   newcomers. That is what makes "create a custom field and it shows up as a new column
 *   at the end" true even for a user who rearranged their columns months ago — their
 *   arrangement is respected AND the new field is visible without them hunting for it.
 */
export function applyOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const arranged = order
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);

  const placed = new Set(arranged.map((item) => item.id));
  return [...arranged, ...items.filter((item) => !placed.has(item.id))];
}

/**
 * Move `movedId` to where `targetId` currently sits.
 *
 * Takes the ids in their CURRENT rendered order, not the stored `order`, because the
 * stored order can be partial — dropping onto a column the user has never rearranged
 * has to work too. The result is a complete order, which is also what makes the first
 * drag on a fresh browser pin down everything else's position.
 */
export function moveItem(
  currentIds: string[],
  movedId: string,
  targetId: string,
): string[] {
  if (movedId === targetId) return currentIds;
  const without = currentIds.filter((id) => id !== movedId);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex === -1) return currentIds;

  // Dropping onto something to the RIGHT puts the item after it, to the LEFT before it,
  // which is what a dragged item landing under the cursor looks like either way.
  const movingRight = currentIds.indexOf(movedId) < currentIds.indexOf(targetId);
  const insertAt = movingRight ? targetIndex + 1 : targetIndex;
  return [...without.slice(0, insertAt), movedId, ...without.slice(insertAt)];
}

/** Shift one item one place towards the front (`-1`) or the back (`+1`). */
export function nudgeItem(
  currentIds: string[],
  movedId: string,
  delta: -1 | 1,
): string[] {
  const from = currentIds.indexOf(movedId);
  if (from === -1) return currentIds;
  const to = from + delta;
  if (to < 0 || to >= currentIds.length) return currentIds;

  const next = [...currentIds];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Add or remove one id from the hidden list. */
export function toggleHidden(hidden: string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}
