/**
 * Turning the flat list of document types from `/file-types/` into something a person
 * can actually pick from.
 *
 * The catalog is 22 types and still growing, which is well past the point where one long
 * row of buttons is usable. Each type carries its own heading (`group_label`) and that
 * heading's position (`group_order`) from the backend, so this module only has to bucket
 * and sort — it never decides what the groups are. That is deliberate: a group list
 * hardcoded here would go stale the day one is added to the catalog, the same reason the
 * types themselves are served rather than hardcoded (see `lib/fileTypes.ts`).
 */
import type { FileType } from "./types";

/** One heading and the documents filed under it. */
export type FileTypeGroup = {
  /** Stable key, e.g. "tax". Used as a React key and for select-all controls. */
  key: string;
  /** What the user reads, e.g. "Fiscales / SAT". */
  label: string;
  fileTypes: FileType[];
};

/**
 * Heading used for a type whose group the backend did not report.
 *
 * Spanish, matching the headings the API sends (see `FILE_TYPE_GROUPS` in
 * `backend/core/file_type_catalog.py`) — a lone English heading in that list would stand
 * out as a bug.
 */
const UNGROUPED_LABEL = "Otros";

type GroupedFields = {
  group?: string | null;
  group_label?: string | null;
  group_order?: number | null;
};

/**
 * Splits `fileTypes` into groups, ordered as the backend declares, with the documents
 * inside each group left in the order they arrived (the API sorts them by label).
 *
 * A type missing its group falls into a trailing "Other" heading rather than being
 * dropped — a document the user cannot see is far worse than one under a vague heading.
 */
export function groupFileTypes(fileTypes: FileType[]): FileTypeGroup[] {
  const groups = new Map<string, FileTypeGroup & { order: number }>();

  for (const fileType of fileTypes) {
    const fields = fileType as FileType & GroupedFields;
    const key = fields.group || "other";
    const label = fields.group_label || UNGROUPED_LABEL;
    // Unreported order sorts last, keeping known groups in their intended reading order.
    const order = typeof fields.group_order === "number" ? fields.group_order : Number.MAX_SAFE_INTEGER;

    const existing = groups.get(key);
    if (existing) {
      existing.fileTypes.push(fileType);
    } else {
      groups.set(key, { key, label, order, fileTypes: [fileType] });
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(({ key, label, fileTypes: members }) => ({ key, label, fileTypes: members }));
}

/**
 * The types matching a search box.
 *
 * Matches the English label, the Spanish label and the key, because the app's users are
 * Mexican companies who will type "acta" or "constancia" as readily as "articles of
 * incorporation". An empty query matches everything.
 */
export function searchFileTypes(fileTypes: FileType[], query: string): FileType[] {
  const q = query.trim().toLowerCase();
  if (!q) return fileTypes;

  return fileTypes.filter((fileType) =>
    [fileType.label_en, fileType.label_es, fileType.key]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(q)),
  );
}

/**
 * The ids of the types the catalog marks as a sensible starting selection.
 *
 * Used by the "Suggested" shortcut: an organization setting up for the first time should
 * not have to reason about all 22 documents to get a workable list.
 */
export function suggestedFileTypeIds(fileTypes: FileType[]): number[] {
  return fileTypes
    .filter((fileType) => (fileType as FileType & { is_default_suggestion?: boolean }).is_default_suggestion)
    .map((fileType) => fileType.id);
}
