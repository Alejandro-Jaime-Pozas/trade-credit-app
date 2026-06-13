/**
 * Browser localStorage helpers.
 *
 * Wraps `window.localStorage` so other modules can persist data (e.g. JWT tokens)
 * without crashing during Next.js server rendering, where `window` does not exist.
 *
 * Used by: `api.ts` (token storage). You rarely need to edit this file.
 */
export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getLocalStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function setLocalStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export function removeLocalStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

