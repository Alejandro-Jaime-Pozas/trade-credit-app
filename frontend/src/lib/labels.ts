/**
 * Labels — the user's own custom fields.
 *
 * A `Label` is a field DEFINITION the user creates ("sucursal"), scoped to one model.
 * A `LabelValue` is one object's value for it ("MTY Norte"). Together they let a user
 * add a field to credit cases without a database migration, and the backend folds the
 * values back into `CreditCase.custom_fields` as a plain `{ name: value }` map — which
 * is why the dashboard can treat a label as just another column.
 *
 * Everything here is either a thin API wrapper or a pure helper, so the pure parts stay
 * unit-testable without a DOM (matching `tableControls.ts` / `fileTypes.ts`).
 */
import { apiJson, drfListAll } from "./api";
import type { Label, LabelValue } from "./types";

/**
 * The Django model name labels are attached to for the credit cases dashboard.
 *
 * The API takes a model NAME rather than a ContentType database id, because those ids
 * are assigned per-database and would differ between dev, CI and production.
 */
export const CREDIT_CASE_CONTENT_TYPE = "creditcase";

/** Longest label name the backend's `Label.name` column accepts. */
export const LABEL_NAME_MAX_LENGTH = 50;

/** Longest value the backend's `LabelValue.value` column accepts. */
export const LABEL_VALUE_MAX_LENGTH = 250;

// ── Pure helpers ───────────────────────────────────────────────────

/**
 * The table column id for a label.
 *
 * Prefixed so a label called "id" or "status" can never collide with a built-in
 * column's id, which would silently make one column's filter drive the other's.
 * Keyed by label id rather than name so renaming a label keeps its column state.
 */
export function labelColumnId(label: Pick<Label, "id">): string {
  return `label:${label.id}`;
}

/** True when `columnId` came from {@link labelColumnId}. */
export function isLabelColumnId(columnId: string): boolean {
  return columnId.startsWith("label:");
}

/**
 * One object's value for a label, read out of the `custom_fields` map the backend
 * sends on the object itself.
 *
 * Returns null both when the label has never been set on this object and when it was
 * set to an empty string, since neither is something worth showing in a cell.
 */
export function customFieldValue(
  customFields: Record<string, string> | null | undefined,
  labelName: string,
): string | null {
  const value = customFields?.[labelName];
  return value != null && value.trim() !== "" ? value : null;
}

/**
 * Checks a proposed label name before it is sent, returning an error message or null.
 *
 * Duplicates are rejected here as well as by the backend's unique constraint, because
 * the constraint failure comes back as a generic 400 that reads far worse than saying
 * plainly that the field already exists.
 */
export function validateLabelName(
  name: string,
  existing: Label[],
  options: { ignoreId?: number } = {},
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a field name.";
  if (trimmed.length > LABEL_NAME_MAX_LENGTH) {
    return `Field names are limited to ${LABEL_NAME_MAX_LENGTH} characters.`;
  }
  const clash = existing.some(
    (l) =>
      l.id !== options.ignoreId &&
      l.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return `A field named "${trimmed}" already exists.`;
  return null;
}

/** Labels ordered the way a person reads a list of field names. */
export function sortLabels(labels: Label[]): Label[] {
  return [...labels].sort((a, b) =>
    a.name.localeCompare(b.name, "es-MX", { sensitivity: "base" }),
  );
}

// ── API wrappers ───────────────────────────────────────────────────

/**
 * Every label the user's organization has defined on credit cases.
 *
 * The list endpoint returns labels for all labelable models (credit cases, customers,
 * documents), so the content type is filtered here — the dashboard only has columns for
 * credit case fields. Organization scoping is the backend's job and is not repeated
 * client-side.
 */
export async function listCreditCaseLabels(): Promise<Label[]> {
  const all = await drfListAll<Label>({ path: "/labels/" });
  return sortLabels(all.filter((l) => l.content_type === CREDIT_CASE_CONTENT_TYPE));
}

/**
 * Payload for writing a Label.
 *
 * Hand-written rather than taken from `api.generated.ts`: the generated `Label` type is
 * the READ shape, where `organization` is a nested `{ url, display }` object and `url`
 * and `id` are required. A create request sends neither.
 */
type LabelWritePayload = {
  name: string;
  content_type: string;
};

/** Creates a new credit case custom field. */
export async function createLabel(name: string): Promise<Label> {
  return apiJson<Label>({
    pathOrUrl: "/labels/",
    method: "POST",
    body: {
      name: name.trim(),
      content_type: CREDIT_CASE_CONTENT_TYPE,
    } satisfies LabelWritePayload,
  });
}

/**
 * Renames a label.
 *
 * PATCH rather than PUT so `content_type` is left untouched — re-sending it would make
 * it possible to repoint a label at a different model, which would orphan every value
 * already recorded under it.
 */
export async function renameLabel(label: Label, name: string): Promise<Label> {
  return apiJson<Label>({
    pathOrUrl: label.url,
    method: "PATCH",
    body: { name: name.trim() },
  });
}

/**
 * Deletes a label and, by cascade, every value recorded for it.
 *
 * Callers must confirm with the user first — the values are not recoverable from the UI.
 */
export async function deleteLabel(label: Label): Promise<void> {
  await apiJson<void>({ pathOrUrl: label.url, method: "DELETE" });
}

/**
 * Values already used for this label, so a user can reuse "MTY Norte" instead of
 * typing a near-duplicate ("MTY norte") that would then filter as a separate value.
 */
export async function listExistingValues(label: Label): Promise<string[]> {
  return apiJson<string[]>({ pathOrUrl: `${label.url}existing-values/` });
}

/**
 * Sets a label's value on one object.
 *
 * This is an upsert: the endpoint replaces an existing value in place rather than
 * failing on the (label, object) unique constraint, so the caller never has to know
 * whether the field was set before. `label` is sent as its API url because the
 * serializer is hyperlinked.
 */
export async function setLabelValue(args: {
  label: Label;
  objectId: number;
  value: string;
}): Promise<LabelValue> {
  return apiJson<LabelValue>({
    pathOrUrl: "/label-values/",
    method: "POST",
    body: {
      label: args.label.url,
      object_id: args.objectId,
      value: args.value.trim(),
    },
  });
}

/**
 * Clears a label's value on one object.
 *
 * Finding the row first is unavoidable: values are addressed by their own id, and the
 * object itself only carries the flattened `custom_fields` map, which has no ids in it.
 * A value that is already absent is not an error — the caller wanted it gone either way.
 */
export async function clearLabelValue(args: {
  label: Label;
  objectId: number;
}): Promise<void> {
  const rows = await drfListAll<LabelValue>({ path: "/label-values/" });
  const match = rows.find(
    (row) => row.object_id === args.objectId && row.label?.url === args.label.url,
  );
  if (!match) return;
  await apiJson<void>({ pathOrUrl: match.url, method: "DELETE" });
}
