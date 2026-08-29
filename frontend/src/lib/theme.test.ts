/**
 * Tests for the theme preference store (src/lib/theme.ts).
 *
 * The behaviour that matters is the precedence rule: an explicit choice beats the
 * operating system's setting, and with no choice stored the OS wins.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  getCurrentTheme,
  getStoredTheme,
  resolveTheme,
  setTheme,
  subscribeToTheme,
} from "./theme";

/** Handlers the fake matchMedia has been asked to call when the OS setting changes. */
let systemChangeHandlers: Array<() => void> = [];

/**
 * jsdom has no real `matchMedia`, so tests that care about the OS preference install
 * this stub. `matches` is what "(prefers-color-scheme: dark)" would report, and
 * `fireSystemChange()` below plays the part of the user flipping their OS theme.
 */
function stubSystemPreference(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersDark,
    addEventListener: (_event: string, handler: () => void) => {
      systemChangeHandlers.push(handler);
    },
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

/** Simulates the operating system switching between light and dark. */
function fireSystemChange(nowPrefersDark: boolean) {
  const handlers = systemChangeHandlers;
  stubSystemPreference(nowPrefersDark);
  systemChangeHandlers = handlers;
  handlers.forEach((handler) => handler());
}

beforeEach(() => {
  // Each test starts from a page with no theme applied and no preference stored.
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  localStorage.clear();
  systemChangeHandlers = [];
  // Default: an OS that is NOT in dark mode, unless a test says otherwise.
  stubSystemPreference(false);
});

describe("applyTheme", () => {
  it("adds the dark class and the dark color-scheme", () => {
    applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    // color-scheme is what makes native scrollbars/dropdowns follow the theme.
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes the dark class again when switching back to light", () => {
    applyTheme("dark");
    applyTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});

describe("getCurrentTheme", () => {
  it("reads the theme back off the <html> element", () => {
    expect(getCurrentTheme()).toBe("light");

    applyTheme("dark");

    expect(getCurrentTheme()).toBe("dark");
  });
});

describe("getStoredTheme", () => {
  it("returns null when the user has never chosen", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("ignores a stored value that isn't a theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "banana");

    expect(getStoredTheme()).toBeNull();
  });

  it("returns the user's stored choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    expect(getStoredTheme()).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("follows the operating system when nothing is stored", () => {
    stubSystemPreference(true);

    expect(resolveTheme()).toBe("dark");
  });

  it("prefers the user's explicit choice over the operating system", () => {
    // OS says dark, user said light -> the user wins.
    stubSystemPreference(true);
    localStorage.setItem(THEME_STORAGE_KEY, "light");

    expect(resolveTheme()).toBe("light");
  });

  it("falls back to light where matchMedia doesn't exist", () => {
    // Older browsers, and any environment without the API at all.
    (window as { matchMedia?: unknown }).matchMedia = undefined;

    expect(resolveTheme()).toBe("light");
  });
});

describe("setTheme", () => {
  it("persists the choice and applies it", () => {
    setTheme("dark");

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(getCurrentTheme()).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("applies the stored theme when run before the page paints", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    // This is what the browser does with the inline <script> in the root layout.
    new Function(THEME_INIT_SCRIPT)();

    expect(getCurrentTheme()).toBe("dark");
  });

  it("falls back to the operating system when nothing is stored", () => {
    stubSystemPreference(true);

    new Function(THEME_INIT_SCRIPT)();

    expect(getCurrentTheme()).toBe("dark");
  });

  it("never throws, even where localStorage is unavailable", () => {
    // Private browsing modes make localStorage.getItem throw outright. A broken theme
    // must not take the whole page down with it.
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();

    getItem.mockRestore();
  });
});

describe("subscribeToTheme", () => {
  it("notifies subscribers when the theme is set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    setTheme("dark");

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("stops notifying after unsubscribing", () => {
    const listener = vi.fn();
    subscribeToTheme(listener)();

    setTheme("dark");

    expect(listener).not.toHaveBeenCalled();
  });

  it("picks up a change made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    // Another tab wrote the preference; the browser fires `storage` in THIS tab.
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));

    expect(getCurrentTheme()).toBe("dark");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("follows the operating system while the user has made no choice", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    fireSystemChange(true);

    expect(getCurrentTheme()).toBe("dark");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("ignores the operating system once the user has chosen", () => {
    setTheme("light");
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    // The OS goes dark, but the user explicitly asked for light — light must stick.
    fireSystemChange(true);

    expect(getCurrentTheme()).toBe("light");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
