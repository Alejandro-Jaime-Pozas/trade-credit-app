"use client";

/**
 * The light/dark mode button that sits in the app header.
 *
 * Shows the theme you would switch TO, which is the convention users expect: a moon
 * while you're in light mode (click for dark), a sun while you're in dark mode.
 *
 * Accessibility notes:
 *   - The icons are `aria-hidden` and the button carries a real `aria-label`, because a
 *     screen reader gets nothing useful out of an SVG.
 *   - `aria-pressed` marks it as a two-state control, so assistive tech announces
 *     whether dark mode is currently on rather than just reading a button label.
 *   - It is a plain `<button>`, so it is keyboard-reachable and activates on Enter/Space
 *     with no extra work.
 */
import { useTheme } from "@/lib/useTheme";

/** Moon outline, shown in light mode ("switch to dark"). */
function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** Sun with rays, shown in dark mode ("switch to light"). */
function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="rounded-md border p-2 text-fg-muted transition-colors hover:bg-surface-subtle hover:text-fg"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
