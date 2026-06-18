import { apiJson, drfListAll } from "./api";
import type { CreditCase } from "./types";

export type CreateCreditCaseInput = {
  customerUrl: string;
  requestedAmount?: string;
  currency?: string;
  requestedTermDays?: number;
};

function sortByCreatedAtDesc(cases: CreditCase[]): CreditCase[] {
  return [...cases].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Credit cases linked to a single customer URL. */
export async function listCreditCasesForCustomer(
  customerUrl: string,
): Promise<CreditCase[]> {
  const all = await drfListAll<CreditCase>({ path: "/credit-cases/" });
  return sortByCreatedAtDesc(all.filter((c) => c.customer === customerUrl));
}

/**
 * After creating a customer, use an auto-created credit case if the backend
 * already created one; otherwise POST a new credit case.
 */
export async function getOrCreateCreditCaseForNewCustomer(
  input: CreateCreditCaseInput,
): Promise<CreditCase> {
  const existing = await listCreditCasesForCustomer(input.customerUrl);
  if (existing.length > 0) {
    return patchCreditCaseFields(existing[0], input);
  }
  return createCreditCase(input);
}

/** Always create a new credit case for an existing customer. */
export async function createCreditCaseForExistingCustomer(
  input: CreateCreditCaseInput,
): Promise<CreditCase> {
  return createCreditCase(input);
}

async function createCreditCase(input: CreateCreditCaseInput): Promise<CreditCase> {
  return apiJson<CreditCase>({
    pathOrUrl: "/credit-cases/",
    method: "POST",
    body: buildCreditCaseBody(input),
  });
}

async function patchCreditCaseFields(
  creditCase: CreditCase,
  input: CreateCreditCaseInput,
): Promise<CreditCase> {
  const body = buildCreditCaseBody(input);
  const hasUpdates =
    body.requested_amount !== undefined ||
    body.currency !== undefined ||
    body.requested_term_days !== undefined;

  if (!hasUpdates) return creditCase;

  return apiJson<CreditCase>({
    pathOrUrl: creditCase.url,
    method: "PATCH",
    body,
  });
}

function buildCreditCaseBody(input: CreateCreditCaseInput): {
  customer: string;
  requested_amount?: string;
  currency?: string;
  requested_term_days?: number;
} {
  const body: {
    customer: string;
    requested_amount?: string;
    currency?: string;
    requested_term_days?: number;
  } = { customer: input.customerUrl };

  if (input.requestedAmount?.trim()) {
    body.requested_amount = input.requestedAmount.trim();
  }
  if (input.currency) {
    body.currency = input.currency;
  }
  if (input.requestedTermDays !== undefined) {
    body.requested_term_days = input.requestedTermDays;
  }

  return body;
}
