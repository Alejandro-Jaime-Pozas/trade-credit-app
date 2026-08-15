/**
 * Tests for money parsing and normalisation (src/lib/money.ts).
 *
 * These functions sit between what a user types and what reaches the API, so the cases
 * that matter are the half-finished ones. `sanitizeMoneyTyping` runs on every keystroke
 * and must let `"1500."` and `"-"` through on their way to being valid; anything
 * stricter deletes characters as the user types them.
 */
import { describe, expect, it } from "vitest";
import {
  formatAmountGrouped,
  normalizeAmount,
  parseAmount,
  sanitizeMoneyTyping,
  toEditableAmount,
} from "./money";

describe("sanitizeMoneyTyping", () => {
  it("keeps a plain amount untouched", () => {
    expect(sanitizeMoneyTyping("1500000.00")).toBe("1500000.00");
    expect(sanitizeMoneyTyping("0")).toBe("0");
  });

  it("allows half-finished input through", () => {
    // Deleting these as they are typed would make the field impossible to use.
    expect(sanitizeMoneyTyping("1500.")).toBe("1500.");
    expect(sanitizeMoneyTyping("-")).toBe("-");
    expect(sanitizeMoneyTyping("")).toBe("");
  });

  it("strips grouping separators and currency symbols from a paste", () => {
    expect(sanitizeMoneyTyping("$1,500,000.00")).toBe("1500000.00");
    expect(sanitizeMoneyTyping("MXN 1,500.50")).toBe("1500.50");
    expect(sanitizeMoneyTyping("1 500 000")).toBe("1500000");
  });

  it("keeps only the first decimal point", () => {
    // A stray keypress shouldn't wipe what was already typed.
    expect(sanitizeMoneyTyping("1.5.7")).toBe("1.57");
  });

  it("limits decimals to two", () => {
    expect(sanitizeMoneyTyping("10.999")).toBe("10.99");
  });

  it("keeps a minus only at the front", () => {
    expect(sanitizeMoneyTyping("-500")).toBe("-500");
    expect(sanitizeMoneyTyping("50-0")).toBe("500");
  });

  it("drops letters entirely", () => {
    expect(sanitizeMoneyTyping("abc")).toBe("");
    expect(sanitizeMoneyTyping("12abc34")).toBe("1234");
  });
});

describe("normalizeAmount", () => {
  it("pads to two decimals for the API", () => {
    expect(normalizeAmount("1500")).toBe("1500.00");
    expect(normalizeAmount("1500.")).toBe("1500.00");
    expect(normalizeAmount("1500.5")).toBe("1500.50");
    expect(normalizeAmount(".5")).toBe("0.50");
  });

  it("leaves an already-canonical value alone", () => {
    expect(normalizeAmount("1500000.00")).toBe("1500000.00");
  });

  it("returns empty for anything that never became a number", () => {
    // Callers send "" as null rather than posting a broken decimal.
    expect(normalizeAmount("")).toBe("");
    expect(normalizeAmount("-")).toBe("");
    expect(normalizeAmount(".")).toBe("");
    expect(normalizeAmount("abc")).toBe("");
  });

  it("normalises a pasted, formatted amount", () => {
    expect(normalizeAmount("$1,500,000")).toBe("1500000.00");
  });

  it("does not round away money", () => {
    // Decimals are already capped at two before this point, so padding is all that is
    // left to do — a value can never be silently rounded down here.
    expect(normalizeAmount("10.99")).toBe("10.99");
    expect(normalizeAmount("10.999")).toBe("10.99");
  });

  it("keeps large amounts exact", () => {
    expect(normalizeAmount("999999999.99")).toBe("999999999.99");
  });
});

describe("toEditableAmount", () => {
  it("gives back plain text with no grouping, for typing into", () => {
    expect(toEditableAmount("1500000.00")).toBe("1500000.00");
  });

  it("is empty for a missing amount", () => {
    expect(toEditableAmount(null)).toBe("");
    expect(toEditableAmount(undefined)).toBe("");
  });
});

describe("parseAmount", () => {
  it("parses for display and sorting only", () => {
    expect(parseAmount("1500000.00")).toBe(1500000);
    expect(parseAmount(250)).toBe(250);
  });

  it("is null for anything unusable", () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("formatAmountGrouped", () => {
  it("groups without a currency code, for use inside the edit field", () => {
    // The currency is chosen in its own control beside the box, so repeating the code
    // in the input would be noise.
    expect(formatAmountGrouped("1500000")).toBe("1,500,000.00");
    expect(formatAmountGrouped("1500000.5")).toBe("1,500,000.50");
  });

  it("is empty for a missing amount, so the placeholder can show", () => {
    expect(formatAmountGrouped(null)).toBe("");
    expect(formatAmountGrouped("")).toBe("");
  });
});
