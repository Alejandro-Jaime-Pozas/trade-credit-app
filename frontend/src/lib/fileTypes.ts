/**
 * Document requirements: the file type catalog and an organization's template.
 *
 * File types are defined once on the backend (`backend/core/file_type_catalog.py`) and
 * served from `/file-types/`. The frontend must NOT keep its own list of them — a
 * hardcoded copy silently goes stale the moment a new type is added, rendering raw keys
 * like `acta_constitutiva` instead of readable labels.
 */
import { apiJson, drfListAll } from "./api";
import type {
  CreditCase,
  CreditCaseRequirement,
  FileType,
  RequirementTemplate,
  RequirementTemplateItem,
} from "./types";

/** Every file type this user may require: the app's own plus their organization's. */
export async function listFileTypes(): Promise<FileType[]> {
  return drfListAll<FileType>({ path: "/file-types/" });
}

/**
 * The organization's default requirement template, or `null` if they have never set
 * one up.
 *
 * `null` is the onboarding signal: it means this user has not chosen their required
 * documents yet, so they should be prompted to instead of being shown a default.
 */
export async function getDefaultTemplate(): Promise<RequirementTemplate | null> {
  const templates = await drfListAll<RequirementTemplate>({
    path: "/requirement-templates/",
  });
  return templates.find((t) => t.is_default) ?? templates[0] ?? null;
}

/** Create the organization's first default template from a set of file type ids. */
export async function createDefaultTemplate(args: {
  name?: string;
  fileTypeIds: number[];
}): Promise<RequirementTemplate> {
  return apiJson<RequirementTemplate>({
    pathOrUrl: "/requirement-templates/",
    method: "POST",
    body: {
      name: args.name ?? "Default",
      is_default: true,
      items: args.fileTypeIds.map((id, order) => ({
        file_type: id,
        is_required: true,
        order,
      })),
    },
  });
}

/** Replace a template's document list. Sending `items` swaps the whole list. */
export async function updateTemplateItems(args: {
  template: RequirementTemplate;
  fileTypeIds: number[];
}): Promise<RequirementTemplate> {
  return apiJson<RequirementTemplate>({
    pathOrUrl: args.template.url,
    method: "PATCH",
    body: {
      items: args.fileTypeIds.map((id, order) => ({
        file_type: id,
        is_required: true,
        order,
      })),
    },
  });
}

/**
 * Set exactly which documents one credit case requires.
 *
 * Two mutually exclusive modes, matching what the user clicked:
 * - `requirementTemplateId` — they accepted the org default. Rows stay linked to the
 *   template, so this case is still included in that template's later re-syncs.
 * - `fileTypeIds` — they picked documents for this customer specifically. Rows are
 *   marked manual, so a later re-sync deliberately leaves this case alone.
 */
export async function setCreditCaseRequirements(args: {
  creditCase: CreditCase;
  requirementTemplateId?: number;
  fileTypeIds?: number[];
}): Promise<void> {
  const body =
    args.requirementTemplateId !== undefined
      ? { requirement_template: args.requirementTemplateId }
      : { file_type_ids: args.fileTypeIds ?? [] };

  await apiJson<unknown>({
    pathOrUrl: `${args.creditCase.url}set-requirements/`,
    method: "POST",
    body,
  });
}

/** One credit case a template edit would change, as reported by `impact/`. */
export type TemplateImpactEntry = {
  credit_case_id: number;
  customer_name: string;
  adds: { id: number; key: string; label_en: string }[];
  removes: { id: number; key: string; label_en: string }[];
  updates: { id: number; key: string; label_en: string }[];
  /** Removals the customer has ALREADY uploaded a document for — worth warning about. */
  removes_with_uploads: { id: number; key: string; label_en: string }[];
};

/**
 * Which open credit cases would change if this template were re-applied.
 *
 * Computed live against each case's current requirements, so it is safe to call any
 * time and returns an empty list once everything is in sync.
 */
export async function getTemplateImpact(
  template: RequirementTemplate,
): Promise<TemplateImpactEntry[]> {
  const res = await apiJson<{ credit_cases: TemplateImpactEntry[] }>({
    pathOrUrl: `${template.url}impact/`,
  });
  return res.credit_cases;
}

/** Push the template's current contents onto the chosen open credit cases. */
export async function applyTemplateToCases(args: {
  template: RequirementTemplate;
  creditCaseIds: number[];
}): Promise<void> {
  await apiJson<unknown>({
    pathOrUrl: `${args.template.url}apply/`,
    method: "POST",
    body: { credit_case_ids: args.creditCaseIds },
  });
}

/** The file type ids a template currently lists, in display order. */
export function templateFileTypeIds(
  template: RequirementTemplate | null,
): number[] {
  if (!template) return [];
  return (template.items ?? []).map(
    (item: RequirementTemplateItem) => item.file_type,
  );
}

/**
 * Turn a file type key into something readable.
 *
 * Falls back to title-casing the key itself when the catalog has no entry for it —
 * which is what happens for `unknown`, the classifier's fallback bucket. `unknown` is
 * deliberately absent from `/file-types/` because no customer can hand over an
 * "unknown" document, so it is never something a credit case can require.
 */
export function fileTypeLabel(
  key: string | null | undefined,
  fileTypes: FileType[] | null,
): string {
  if (!key) return "Pending classification";

  const match = fileTypes?.find((f) => f.key === key);
  if (match) return match.label_en;

  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** The requirement rows attached to one credit case. */
export async function listCreditCaseRequirements(
  creditCase: CreditCase,
): Promise<CreditCaseRequirement[]> {
  const all = await drfListAll<CreditCaseRequirement>({
    path: "/credit-case-requirements/",
  });
  return all.filter((r) => r.credit_case.url === creditCase.url);
}

/**
 * Add one document to what this credit case requires.
 *
 * Lands as a per-case (manual) requirement, so a later template re-sync leaves it alone.
 * Re-adding something previously dropped turns that row back on rather than failing.
 */
export async function addCreditCaseRequirement(args: {
  creditCase: CreditCase;
  fileTypeId: number;
}): Promise<CreditCaseRequirement> {
  return apiJson<CreditCaseRequirement>({
    pathOrUrl: "/credit-case-requirements/",
    method: "POST",
    body: {
      credit_case: args.creditCase.url,
      file_type: args.fileTypeId,
      is_required: true,
    },
  });
}

/**
 * Drop one document from what this credit case requires.
 *
 * If it came from the organization's template the removal is STICKY — the backend keeps
 * a record of it being turned off so a later template re-sync cannot put it back.
 */
export async function removeCreditCaseRequirement(
  requirement: CreditCaseRequirement,
): Promise<void> {
  await apiJson<void>({ pathOrUrl: requirement.url, method: "DELETE" });
}
