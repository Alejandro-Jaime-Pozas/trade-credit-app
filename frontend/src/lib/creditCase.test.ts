/**
 * Tests for src/lib/creditCase.ts, with `./api` mocked out entirely -- these
 * exercise the branching/body-building logic (existing case -> PATCH vs none
 * -> POST, field trimming, sort order) without making any HTTP call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiJson, drfListAll } from "./api";
import {
  createCreditCaseForExistingCustomer,
  getOrCreateCreditCaseForNewCustomer,
  listCreditCasesForCustomer,
} from "./creditCase";
import type { CreditCase } from "./types";

vi.mock("./api", () => ({
  apiJson: vi.fn(),
  drfListAll: vi.fn(),
}));

// Minimal fixture builder -- only the fields creditCase.ts actually reads
// are filled in; the rest are cast away since the real CreditCase type has
// many fields irrelevant to this logic.
function makeCreditCase(overrides: Partial<CreditCase> = {}): CreditCase {
  return {
    url: "http://test-api/api/v1/credit-cases/1/",
    customer: "http://test-api/api/v1/customers/1/",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
    // Cast through `unknown`: this fixture only fills in the fields
    // creditCase.ts actually reads, not every required CreditCase property.
  } as unknown as CreditCase;
}

beforeEach(() => {
  vi.mocked(apiJson).mockReset();
  vi.mocked(drfListAll).mockReset();
});

describe("listCreditCasesForCustomer", () => {
  it("filters to only the given customer and sorts newest first", async () => {
    const customerUrl = "http://test-api/api/v1/customers/1/";
    const otherCustomerUrl = "http://test-api/api/v1/customers/2/";
    vi.mocked(drfListAll).mockResolvedValue([
      makeCreditCase({ url: ".../1/", customer: customerUrl, created_at: "2026-01-01T00:00:00Z" }),
      makeCreditCase({ url: ".../2/", customer: otherCustomerUrl, created_at: "2026-02-01T00:00:00Z" }),
      makeCreditCase({ url: ".../3/", customer: customerUrl, created_at: "2026-03-01T00:00:00Z" }),
    ]);

    const result = await listCreditCasesForCustomer(customerUrl);

    expect(result.map((c) => c.url)).toEqual([".../3/", ".../1/"]);
  });
});

describe("getOrCreateCreditCaseForNewCustomer", () => {
  it("PATCHes the existing auto-created case when one already exists", async () => {
    const customerUrl = "http://test-api/api/v1/customers/1/";
    const existing = makeCreditCase({ customer: customerUrl });
    vi.mocked(drfListAll).mockResolvedValue([existing]);
    vi.mocked(apiJson).mockResolvedValue({ ...existing, currency: "MXN" });

    await getOrCreateCreditCaseForNewCustomer({ customerUrl, currency: "MXN" });

    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({ pathOrUrl: existing.url, method: "PATCH" }),
    );
  });

  it("POSTs a new case when none exists yet", async () => {
    const customerUrl = "http://test-api/api/v1/customers/1/";
    vi.mocked(drfListAll).mockResolvedValue([]);
    vi.mocked(apiJson).mockResolvedValue(makeCreditCase({ customer: customerUrl }));

    await getOrCreateCreditCaseForNewCustomer({ customerUrl, currency: "MXN" });

    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({ pathOrUrl: "/credit-cases/", method: "POST" }),
    );
  });

  it("skips the PATCH call entirely when no fields were provided", async () => {
    const customerUrl = "http://test-api/api/v1/customers/1/";
    const existing = makeCreditCase({ customer: customerUrl });
    vi.mocked(drfListAll).mockResolvedValue([existing]);

    const result = await getOrCreateCreditCaseForNewCustomer({ customerUrl });

    // No amount/currency/term supplied -> hasUpdates is false -> the
    // existing case is returned as-is, with no API call made at all.
    expect(apiJson).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

describe("createCreditCaseForExistingCustomer", () => {
  it("always POSTs a new case, even if one already exists", async () => {
    const customerUrl = "http://test-api/api/v1/customers/1/";
    vi.mocked(apiJson).mockResolvedValue(makeCreditCase({ customer: customerUrl }));

    await createCreditCaseForExistingCustomer({ customerUrl });

    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({ pathOrUrl: "/credit-cases/", method: "POST" }),
    );
    // Unlike getOrCreateCreditCaseForNewCustomer, this never checks existing cases.
    expect(drfListAll).not.toHaveBeenCalled();
  });
});

describe("request body building", () => {
  it("drops a whitespace-only requested amount but keeps a literal zero", async () => {
    vi.mocked(apiJson).mockResolvedValue(makeCreditCase());

    await createCreditCaseForExistingCustomer({
      customerUrl: "http://test-api/api/v1/customers/1/",
      requestedAmount: "   ",
    });
    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({ body: { customer: "http://test-api/api/v1/customers/1/" } }),
    );

    vi.mocked(apiJson).mockClear();
    await createCreditCaseForExistingCustomer({
      customerUrl: "http://test-api/api/v1/customers/1/",
      requestedAmount: "0",
    });
    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { customer: "http://test-api/api/v1/customers/1/", requested_amount: "0" },
      }),
    );
  });

  it("maps camelCase input fields to the snake_case DRF field names", async () => {
    vi.mocked(apiJson).mockResolvedValue(makeCreditCase());

    await createCreditCaseForExistingCustomer({
      customerUrl: "http://test-api/api/v1/customers/1/",
      requestedAmount: "1000",
      currency: "MXN",
      requestedTermDays: 30,
    });

    expect(apiJson).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          customer: "http://test-api/api/v1/customers/1/",
          requested_amount: "1000",
          currency: "MXN",
          requested_term_days: 30,
        },
      }),
    );
  });
});
