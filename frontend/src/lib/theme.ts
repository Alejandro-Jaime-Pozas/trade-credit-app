/**
 * Light/dark theme preference.
 *
 * The theme is expressed as a single `dark` class on `<html>`: when it is there the
 * design tokens in `globals.css` switch to their dark values, and the whole UI follows.
 * This module is the only thing that puts that class on or takes it off.
 *
 * Three rules define the behaviour:
 *   1. If the user has chosen a theme, that choice wins and is remembered in
 *      `localStorage` (so it survives reloads and applies in every tab).
 *   2. If they never chose, follow the operating system's light/dark setting, and keep
 *      following it if the OS setting later changes.
 *   3. The class is applied BEFORE the page paints (see `THEME_INIT_SCRIPT`), so a
 *      dark-mode user never gets a flash of white page while React boots.
 *
 * This module deliberately contains no React: `app/layout.tsx` is a Server Component and
 * imports `THEME_INIT_SCRIPT` from here, and a Server Component cannot import a module
 * that depends on client-only hooks. The React binding lives in `useTheme.ts`.
 *
 * Used by: `lib/useTheme.ts` (the hook behind the button) and `app/layout.tsx`.
 */
import { getLocalStorageItem, setLocalStorageItem } from "./storage";

export type Theme = "light" | "dark";

/** localStorage key holding the user's explicit choice. Absent means "follow the OS". */
export const THEME_STORAGE_KEY = "theme";

/** The CSS media query that reports the operating system's dark mode setting. */
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * A blocking `<script>` run in `<head>` before the page renders (see `app/layout.tsx`).
 *
 * It duplicates the small resolve-and-apply logic below on purpose: it has to run before
 * any React code is downloaded, which is the only way to avoid a white flash for
 * dark-mode users. It is wrapped in try/catch because `localStorage` throws outright in
 * some privacy modes, and a broken theme must never take the whole page down with it.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("${DARK_MEDIA_QUERY}").matches?"dark":"light";}var e=document.documentElement;e.classList.toggle("dark",t==="dark");e.style.colorScheme=t;}catch(e){}})();`;

/** The OS-level preference, or "light" where it can't be read (server, old browsers). */
function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/** The user's stored choice, or null if they've never picked one (or stored junk). */
export function getStoredTheme(): Theme | null {
  const stored = getLocalStorageItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

/** What the theme should be right now: an explicit choice first, else the OS setting. */
export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

/**
 * Puts the theme into effect: toggles the `dark` class that all the tokens hang off, and
 * sets `color-scheme` so browser-drawn UI (scrollbars, dropdowns, date pickers) matches
 * instead of staying stubbornly white.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * The theme currently shown, read back off the DOM.
 *
 * Reading the DOM rather than a JavaScript variable means React and the pre-paint script
 * can never disagree about what's on screen — there is one source of truth.
 */
export function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Callbacks to run whenever the theme changes; see `subscribeToTheme` below. */
const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

/** Records an explicit user choice, applies it, and re-renders anything listening. */
export function setTheme(theme: Theme): void {
  setLocalStorageItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  emitChange();
}

/**
 * Subscribes to theme changes, from three sources:
 *   - this tab, via `setTheme` above;
 *   - another tab of the app changing the preference (`storage` event);
 *   - the operating system flipping its own light/dark setting, which only matters
 *     while the user has NOT made an explicit choice.
 */
export function subscribeToTheme(onThemeChange: () => void): () => void {
  listeners.add(onThemeChange);

  if (typeof window === "undefined") {
    return () => {
      listeners.delete(onThemeChange);
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyTheme(resolveTheme());
    emitChange();
  };
  window.addEventListener("storage", onStorage);

  const media =
    typeof window.matchMedia === "function" ? window.matchMedia(DARK_MEDIA_QUERY) : null;
  const onSystemChange = () => {
    // An explicit choice outranks the OS, so only follow the OS when there isn't one.
    if (getStoredTheme() !== null) return;
    applyTheme(getSystemTheme());
    emitChange();
  };
  media?.addEventListener("change", onSystemChange);

  return () => {
    listeners.delete(onThemeChange);
    window.removeEventListener("storage", onStorage);
    media?.removeEventListener("change", onSystemChange);
  };
}

