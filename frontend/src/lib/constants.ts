// Labels for file_type_name values are NOT kept here. They come from the backend's
// file type catalog via `GET /file-types/` — see `fileTypeLabel()` in lib/fileTypes.ts.
// A hardcoded map here would silently go stale every time a document type is added,
// rendering raw keys like "acta_constitutiva" instead of readable names.

export const REQUESTED_TERM_DAYS_OPTIONS = [15, 30, 45, 60, 90] as const;

export type RequestedTermDays = (typeof REQUESTED_TERM_DAYS_OPTIONS)[number];

/** The reviewer's final decision on a case. Set by hand from the detail page. */
export const CREDIT_CASE_VERDICT_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const CREDIT_CASE_STATUS_LABELS: Record<string, string> = {
  missing_documents: "Missing documents",
  pending_ai_verdict: "Pending AI verdict",
  buro_de_credito_rejected: "Buró de crédito rejected",
  pending_final_verdict: "Pending final verdict",
  complete: "Complete",
};
