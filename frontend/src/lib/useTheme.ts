"use client";

/**
 * React binding for the light/dark theme (the store itself lives in `theme.ts`).
 *
 * Kept in its own file because `theme.ts` is also imported by the root layout, which is
 * a Server Component and therefore cannot import anything that uses React hooks.
 *
 * Used by: `components/ThemeToggle.tsx`.
 */
import { useSyncExternalStore } from "react";
import { getCurrentTheme, setTheme, subscribeToTheme, type Theme } from "./theme";

export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} {
  /*
   * `useSyncExternalStore` rather than `useState` + `useEffect`, for two reasons:
   *   - the theme genuinely lives outside React (on the <html> element, put there by the
   *     inline script before React even loads), and this hook is React's supported way
   *     to read such a value without tearing;
   *   - the repo's `react-hooks/set-state-in-effect` lint rule rejects the usual
   *     "sync from the DOM in a mount effect" pattern anyway.
   *
   * The third argument is the SERVER snapshot: rendering on the server there is no
   * <html> class to read, so it reports "light" and React re-renders with the real value
   * immediately after hydration.
   */
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getCurrentTheme,
    () => "light" as Theme,
  );

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
  };
}
