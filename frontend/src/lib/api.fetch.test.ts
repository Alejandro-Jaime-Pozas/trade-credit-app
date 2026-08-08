/**
 * Tests for the fetch-driven behavior in src/lib/api.ts: URL building, the
 * Bearer/cache headers added to authenticated requests, the 401-refresh-retry
 * flow, the single-flight token refresh, network-error wrapping, and DRF
 * pagination walking.
 *
 * `fetch` is stubbed globally per test with `vi.stubGlobal` -- nothing in
 * this file makes a real network call.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiJson, drfListAll, getStoredTokens, setStoredTokens } from "./api";

// Builds a minimal JWT-shaped string (header.payload.signature) with the
// given payload, base64url-encoded, so tests can hand api.ts a "valid
// looking" access/refresh token without a real signing key.
function makeToken(payload: object): string {
  const base64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${base64url({ alg: "none" })}.${base64url(payload)}.signature`;
}

// Builds a `Response` with a JSON content-type, matching what api.ts expects
// so it parses the body with `res.json()` instead of falling back to text.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("URL building", () => {
  it("resolves a relative path against the configured API base URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    // vitest.config.mts pins NEXT_PUBLIC_API_BASE_URL to http://test-api/api/v1
    await apiJson({ pathOrUrl: "/users/", auth: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://test-api/api/v1/users/",
      expect.anything(),
    );
  });

  it("passes an absolute URL through unchanged", async () => {
    // DRF's paginated `next` links are full URLs; toUrl must not re-prefix them.
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiJson({ pathOrUrl: "http://other-host/api/v1/things/?page=2", auth: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://other-host/api/v1/things/?page=2",
      expect.anything(),
    );
  });
});

describe("auth headers", () => {
  it("sends no Authorization header when auth is false", async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiJson({
      pathOrUrl: "/auth/login/",
      method: "POST",
      body: { email: "a@b.com", password: "x" },
      auth: false,
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it("attaches a Bearer token and forces cache: no-store on an authenticated request", async () => {
    const validAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
    setStoredTokens({ access: validAccess, refresh: "refresh-token" });

    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => jsonResponse({ id: 1 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiJson({ pathOrUrl: "/protected/" });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(`Bearer ${validAccess}`);
    expect((init as RequestInit).cache).toBe("no-store");
  });
});

describe("401 retry flow", () => {
  it("refreshes the token once and retries the original request on a 401", async () => {
    const validAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
    const newAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 7200 });
    setStoredTokens({ access: validAccess, refresh: "refresh-token" });

    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/auth/refresh/")) {
        return jsonResponse({ access: newAccess, refresh: "refresh-token" });
      }
      // First call to the protected endpoint fails; the retry (after
      // refresh) succeeds.
      const isRetry = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/protected/")).length > 1;
      return isRetry ? jsonResponse({ id: 1 }) : jsonResponse({ detail: "Expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiJson<{ id: number }>({ pathOrUrl: "/protected/" });

    expect(result).toEqual({ id: 1 });
    // protected (401) -> refresh (200) -> protected retry (200) = 3 calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a second time if the retried request also gets a 401", async () => {
    const validAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
    const newAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 7200 });
    setStoredTokens({ access: validAccess, refresh: "refresh-token" });

    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/auth/refresh/")) {
        return jsonResponse({ access: newAccess, refresh: "refresh-token" });
      }
      // Every call to the protected endpoint returns 401, even after refresh.
      return jsonResponse({ detail: "Still expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiJson({ pathOrUrl: "/protected/" })).rejects.toMatchObject({ status: 401 });
    // protected (401) -> refresh (200) -> protected retry (401), then stop.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears stored tokens when the refresh call itself fails", async () => {
    const validAccess = makeToken({ user_id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
    setStoredTokens({ access: validAccess, refresh: "refresh-token" });

    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/auth/refresh/")) {
        return jsonResponse({ detail: "Refresh token invalid" }, 401);
      }
      return jsonResponse({ detail: "Expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiJson({ pathOrUrl: "/protected/" })).rejects.toMatchObject({ status: 401 });
    expect(getStoredTokens()).toEqual({ access: undefined, refresh: undefined });
  });
});

describe("refreshAccessToken single-flight", () => {
  it("collapses concurrent refresh calls into a single request", async () => {
    // refreshPromise is module-level mutable state; reset the module so this
    // test starts from a clean slate rather than depending on other tests'
    // ordering.
    vi.resetModules();
    const apiModule = await import("./api");

    apiModule.setStoredTokens({ access: "stale", refresh: "refresh-token" });

    const fetchMock = vi.fn(async () => jsonResponse({ access: "new-access" }));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      apiModule.refreshAccessToken(),
      apiModule.refreshAccessToken(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
});

describe("safeFetch network errors", () => {
  it("wraps a fetch-level failure in a readable ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(apiJson({ pathOrUrl: "/users/", auth: false })).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Cannot reach API"),
    });
  });
});

describe("drfListAll", () => {
  it("walks every paginated page and concatenates the results", async () => {
    const page1 = {
      count: 3,
      next: "http://test-api/api/v1/things/?page=2",
      previous: null,
      results: [{ id: 1 }, { id: 2 }],
    };
    const page2 = {
      count: 3,
      next: null,
      previous: "http://test-api/api/v1/things/",
      results: [{ id: 3 }],
    };
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("page=2") ? jsonResponse(page2) : jsonResponse(page1),
    );
    vi.stubGlobal("fetch", fetchMock);

    const all = await drfListAll<{ id: number }>({ path: "/things/" });

    expect(all).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
