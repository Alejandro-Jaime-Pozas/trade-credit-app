/**
 * Frontend mirrors of backend defaults in `backend/core/constants.py`.
 * Keep in sync when required file types change.
 */
export const CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED = [
  "cashflow_statement",
] as const;

export type CreditCaseRequiredFileType =
  (typeof CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED)[number];

/** Human-readable labels for upload file_type_name values. */
export const FILE_TYPE_NAME_LABELS: Record<string, string> = {
  cashflow_statement: "Cashflow statement",
  bank_statement: "Bank statement",
  balance_sheet: "Balance sheet",
  income_statement: "Income statement",
  constancia_de_situacion_fiscal: "Constancia de situación fiscal (CSF)",
  unknown: "Unknown",
};

export const REQUESTED_TERM_DAYS_OPTIONS = [15, 30, 45, 60, 90] as const;

export type RequestedTermDays = (typeof REQUESTED_TERM_DAYS_OPTIONS)[number];

export const CREDIT_CASE_STATUS_LABELS: Record<string, string> = {
  missing_documents: "Missing documents",
  pending_ai_verdict: "Pending AI verdict",
  buro_de_credito_rejected: "Buró de crédito rejected",
  pending_final_verdict: "Pending final verdict",
  complete: "Complete",
};
