/**
 * Tests for `formatDate` and `formatMoney` (src/lib/format.ts).
 *
 * These are pure display formatters used across the customer/credit-case
 * pages, so we cover the "no value" and "bad value" fallbacks alongside the
 * happy path — a wrong fallback here would silently show garbage to users
 * instead of failing loudly.
 */
import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./format";

describe("formatDate", () => {
  it("shows an em dash placeholder for missing values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("echoes back a string it cannot parse as a date", () => {
    // `new Date("not-a-date")` is an Invalid Date, so formatDate falls back
    // to returning the original string instead of "Invalid Date".
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO timestamp", () => {
    const result = formatDate("2026-01-15T12:00:00Z");
    // We don't assert an exact locale string (that's toLocaleString's job to
    // get right) — just that a real value was produced, not the placeholder.
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatMoney", () => {
  it("shows an em dash placeholder for missing values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("shows an em dash placeholder for a non-numeric amount", () => {
    expect(formatMoney("not-a-number")).toBe("—");
  });

  it("formats a decimal string with a currency code, matching the documented example", () => {
    // Intl.NumberFormat's es-MX currency format inserts a NON-BREAKING space
    // (U+00A0) between the code and the amount, not a regular space -- the
    // docstring example in format.ts is visually identical but that detail
    // matters for an exact string match here.
    expect(formatMoney("1500000.00", "MXN")).toBe("MXN 1,500,000.00");
  });

  it("formats without a currency as a plain grouped number", () => {
    expect(formatMoney("1500000.00")).toBe("1,500,000.00");
  });

  it("falls back to a plain grouped number prefixed with the raw code when Intl rejects the currency", () => {
    // "XXX" isn't a real ISO 4217 currency code recognized by this Intl
    // build, so `formatMoney` should catch the Intl throw and fall back
    // rather than let the error escape.
    expect(formatMoney("100", "NOT_A_CODE")).toBe("NOT_A_CODE 100.00");
  });

  it("treats an empty string amount as zero rather than missing", () => {
    // Characterization test: Number("") is 0, not NaN, so it never hits the
    // NaN guard. This documents the existing behavior rather than asserting
    // it's ideal — a caller passing "" gets "0.00", not "—".
    expect(formatMoney("")).toBe("0.00");
  });
});
