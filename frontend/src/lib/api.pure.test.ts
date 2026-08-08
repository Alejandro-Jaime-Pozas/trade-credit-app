/**
 * Tests for the pure, no-fetch-involved helpers in src/lib/api.ts:
 * `formatDrfError`, `decodeJwtPayload`, `isAccessTokenExpired`, and
 * `getUserIdFromAccessToken`.
 *
 * Network-dependent behavior (auth headers, 401 retry, token refresh) lives
 * in `api.fetch.test.ts` instead, so these can run without mocking `fetch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeJwtPayload,
  formatDrfError,
  getUserIdFromAccessToken,
  isAccessTokenExpired,
} from "./api";

describe("formatDrfError", () => {
  it("returns a plain string body as-is", () => {
    expect(formatDrfError("Something went wrong")).toBe("Something went wrong");
  });

  it("prefers a top-level detail message", () => {
    expect(formatDrfError({ detail: "Not found." })).toBe("Not found.");
  });

  it("formats a single field's error list with a Title Case label", () => {
    expect(formatDrfError({ email: ["This field is required."] })).toBe(
      "Email: This field is required.",
    );
  });

  it("joins multiple messages for one field with a comma", () => {
    expect(formatDrfError({ email: ["Too short.", "Invalid format."] })).toBe(
      "Email: Too short., Invalid format.",
    );
  });

  it("suppresses the label for non_field_errors", () => {
    expect(formatDrfError({ non_field_errors: ["Invalid credentials."] })).toBe(
      "Invalid credentials.",
    );
  });

  it("uses the RFC special-case label instead of Title Casing it", () => {
    expect(formatDrfError({ rfc: ["Invalid checksum."] })).toBe(
      "RFC: Invalid checksum.",
    );
  });

  it("joins multiple fields with a middle dot", () => {
    const result = formatDrfError({
      email: ["Required."],
      rfc: ["Invalid."],
    });
    expect(result).toBe("Email: Required. · RFC: Invalid.");
  });

  it("falls back to the default message for an empty body", () => {
    expect(formatDrfError({})).toBe("Request failed");
    expect(formatDrfError(null)).toBe("Request failed");
  });

  it("accepts a custom fallback message", () => {
    expect(formatDrfError(null, "Upload failed")).toBe("Upload failed");
  });
});

describe("decodeJwtPayload", () => {
  // Builds a minimal JWT-shaped string (header.payload.signature) so we
  // don't need a real signing key just to test the base64url decode.
  function makeToken(payload: object): string {
    const base64url = (obj: object) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${base64url({ alg: "none" })}.${base64url(payload)}.signature`;
  }

  it("decodes a valid base64url-encoded payload", () => {
    const token = makeToken({ user_id: 42, exp: 1234567890 });
    expect(decodeJwtPayload(token)).toEqual({ user_id: 42, exp: 1234567890 });
  });

  it("returns null when the token has fewer than two segments", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });

  it("returns null when the payload segment isn't valid base64/JSON", () => {
    expect(decodeJwtPayload("header.%%%not-base64%%%.sig")).toBeNull();
  });
});

describe("isAccessTokenExpired", () => {
  // Reuse the same token builder as above.
  function makeToken(payload: object): string {
    const base64url = (obj: object) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${base64url({ alg: "none" })}.${base64url(payload)}.signature`;
  }

  beforeEach(() => {
    // Pin "now" so expiry comparisons are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false for a token that expires well in the future", () => {
    const oneHourFromNow = Math.floor(Date.now() / 1000) + 3600;
    expect(isAccessTokenExpired(makeToken({ exp: oneHourFromNow }))).toBe(false);
  });

  it("returns true for a token that already expired", () => {
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    expect(isAccessTokenExpired(makeToken({ exp: oneHourAgo }))).toBe(true);
  });

  it("treats a token with no exp claim as expired", () => {
    expect(isAccessTokenExpired(makeToken({}))).toBe(true);
  });

  it("treats a token inside the skew window as expired", () => {
    // Default skew is 30s: an expiry 10s from now is within that window,
    // so it should already be treated as expired to avoid racing a real
    // request against the token dying mid-flight.
    const tenSecondsFromNow = Math.floor(Date.now() / 1000) + 10;
    expect(isAccessTokenExpired(makeToken({ exp: tenSecondsFromNow }))).toBe(true);
  });

  it("returns false for a token just outside the skew window", () => {
    const oneMinuteFromNow = Math.floor(Date.now() / 1000) + 60;
    expect(isAccessTokenExpired(makeToken({ exp: oneMinuteFromNow }))).toBe(false);
  });
});

describe("getUserIdFromAccessToken", () => {
  function makeToken(payload: object): string {
    const base64url = (obj: object) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${base64url({ alg: "none" })}.${base64url(payload)}.signature`;
  }

  it("returns a numeric user_id as-is", () => {
    expect(getUserIdFromAccessToken(makeToken({ user_id: 7 }))).toBe(7);
  });

  it("parses a numeric-string user_id", () => {
    expect(getUserIdFromAccessToken(makeToken({ user_id: "7" }))).toBe(7);
  });

  it("returns null for a non-numeric string user_id", () => {
    expect(getUserIdFromAccessToken(makeToken({ user_id: "abc" }))).toBeNull();
  });

  it("returns null when user_id is missing", () => {
    expect(getUserIdFromAccessToken(makeToken({}))).toBeNull();
  });

  it("characterizes user_id 0 as indistinguishable from 'missing' downstream", () => {
    // getUserIdFromAccessToken itself correctly returns 0 here. This is
    // documented because auth.tsx's caller uses `if (!userId)`, which would
    // treat a real id of 0 the same as "not found" -- worth knowing if user
    // ids are ever allowed to start at 0.
    expect(getUserIdFromAccessToken(makeToken({ user_id: 0 }))).toBe(0);
  });
});
