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
}): Promise<T> {
  const res = await fetch(toUrl(args.pathOrUrl), {
    method: args.method ?? "GET",
    headers: {
      "content-type": "application/json",
    },
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: args.signal,
    cache: "no-store",
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

export async function apiForm<T>(args: {
  pathOrUrl: string;
  method?: "POST" | "PUT" | "PATCH";
  form: FormData;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await fetch(toUrl(args.pathOrUrl), {
    method: args.method ?? "POST",
    body: args.form,
    signal: args.signal,
    cache: "no-store",
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

