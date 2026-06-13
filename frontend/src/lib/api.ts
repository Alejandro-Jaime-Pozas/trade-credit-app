/**
 * HTTP client for the Django REST API.
 *
 * All backend communication goes through this file. Pages call `apiJson`,
 * `apiForm`, or `drfListAll` instead of raw `fetch`.
 *
 * Responsibilities:
 * - Build full URLs from `NEXT_PUBLIC_API_BASE_URL` (default localhost:8000)
 * - Attach JWT `Authorization: Bearer …` headers on authenticated requests
 * - Refresh expired access tokens via `/auth/refresh/`
 * - Throw `ApiError` with a readable message when the server returns 4xx/5xx
 *
 * Public endpoints (login, signup) pass `auth: false` so no token is sent.
 */
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "./storage";

export type ApiErrorBody =
  | { detail?: string; [key: string]: unknown }
  | string
  | unknown;

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;

  constructor(args: { status: number; body: ApiErrorBody; message: string }) {
    super(args.message);
    this.status = args.status;
    this.body = args.body;
  }
}

const ACCESS_TOKEN_KEY = "tca.accessToken";
const REFRESH_TOKEN_KEY = "tca.refreshToken";

export type AuthTokens = {
  access: string;
  refresh: string;
};

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ||
    "http://localhost:8000/api/v1"
  );
}

function toUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = getApiBaseUrl();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function getStoredTokens(): Partial<AuthTokens> {
  return {
    access: getLocalStorageItem(ACCESS_TOKEN_KEY) ?? undefined,
    refresh: getLocalStorageItem(REFRESH_TOKEN_KEY) ?? undefined,
  };
}

export function setStoredTokens(tokens: AuthTokens): void {
  setLocalStorageItem(ACCESS_TOKEN_KEY, tokens.access);
  setLocalStorageItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function clearStoredTokens(): void {
  removeLocalStorageItem(ACCESS_TOKEN_KEY);
  removeLocalStorageItem(REFRESH_TOKEN_KEY);
}

type JwtPayload = {
  user_id?: number | string;
  exp?: number;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isAccessTokenExpired(token: string, skewSeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

export function getUserIdFromAccessToken(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const raw = payload?.user_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

let refreshPromise: Promise<AuthTokens> | null = null;

export async function refreshAccessToken(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refresh } = getStoredTokens();
    if (!refresh) {
      throw new ApiError({
        status: 401,
        body: null,
        message: "No refresh token",
      });
    }

    const res = await fetch(toUrl("/auth/refresh/"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await readBodySafe(res);
      throw new ApiError({
        status: res.status,
        body,
        message: "Token refresh failed",
      });
    }

    const data = (await res.json()) as { access: string; refresh?: string };
    const tokens: AuthTokens = {
      access: data.access,
      refresh: data.refresh ?? refresh,
    };
    setStoredTokens(tokens);
    return tokens;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function readBodySafe(res: Response): Promise<ApiErrorBody> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

async function ensureValidAccessToken(): Promise<string | null> {
  const { access, refresh } = getStoredTokens();
  if (!access) return null;
  if (!isAccessTokenExpired(access)) return access;
  if (!refresh) return null;
  const tokens = await refreshAccessToken();
  return tokens.access;
}

async function authenticatedFetch(
  pathOrUrl: string,
  init: RequestInit,
  retried = false,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const access = await ensureValidAccessToken();
  if (access) {
    headers.set("Authorization", `Bearer ${access}`);
  }

  const res = await fetch(toUrl(pathOrUrl), {
    ...init,
    headers,
    cache: "no-store",
  });

  if (res.status === 401 && !retried && getStoredTokens().refresh) {
    try {
      await refreshAccessToken();
      return authenticatedFetch(pathOrUrl, init, true);
    } catch {
      clearStoredTokens();
    }
  }

  return res;
}

export type DrfPaginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export async function apiJson<T>(args: {
  pathOrUrl: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
}): Promise<T> {
  const init: RequestInit = {
    method: args.method ?? "GET",
    headers: {
      "content-type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: args.signal,
  };
  const res =
    args.auth === false
      ? await fetch(toUrl(args.pathOrUrl), { ...init, cache: "no-store" })
      : await authenticatedFetch(args.pathOrUrl, init);

  if (!res.ok) {
    const body = await readBodySafe(res);
    const msg =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail ?? "Request failed")
        : `Request failed (${res.status})`;
    throw new ApiError({ status: res.status, body, message: msg });
  }

  return (await res.json()) as T;
}

export async function apiForm<T>(args: {
  pathOrUrl: string;
  method?: "POST" | "PUT" | "PATCH";
  form: FormData;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await authenticatedFetch(args.pathOrUrl, {
    method: args.method ?? "POST",
    body: args.form,
    signal: args.signal,
  });

  if (!res.ok) {
    const body = await readBodySafe(res);
    const msg =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail ?? "Request failed")
        : `Request failed (${res.status})`;
    throw new ApiError({ status: res.status, body, message: msg });
  }

  return (await res.json()) as T;
}

export async function drfListAll<T>(args: { path: string }): Promise<T[]> {
  const first = await apiJson<DrfPaginated<T>>({ pathOrUrl: args.path });
  const all = [...first.results];
  let next = first.next;
  while (next) {
    const page = await apiJson<DrfPaginated<T>>({ pathOrUrl: next });
    all.push(...page.results);
    next = page.next;
  }
  return all;
}
