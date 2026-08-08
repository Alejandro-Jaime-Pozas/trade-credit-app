// @vitest-environment node
/**
 * Tests for src/lib/storage.ts.
 *
 * This file overrides the suite's default jsdom environment with Node (see
 * the `@vitest-environment node` comment above -- it must be the very first
 * line). jsdom always provides a `window`, so it's the only way to actually
 * exercise the `typeof window === "undefined"` SSR guards these helpers
 * exist for.
 */
import { describe, expect, it } from "vitest";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  safeJsonParse,
  setLocalStorageItem,
} from "./storage";

describe("SSR guards (no window)", () => {
  it("getLocalStorageItem returns null instead of throwing", () => {
    expect(getLocalStorageItem("any-key")).toBeNull();
  });

  it("setLocalStorageItem is a no-op instead of throwing", () => {
    expect(() => setLocalStorageItem("any-key", "value")).not.toThrow();
  });

  it("removeLocalStorageItem is a no-op instead of throwing", () => {
    expect(() => removeLocalStorageItem("any-key")).not.toThrow();
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(safeJsonParse("{not json")).toBeNull();
  });

  it("returns null for a null or empty input", () => {
    expect(safeJsonParse(null)).toBeNull();
    expect(safeJsonParse("")).toBeNull();
  });
});
