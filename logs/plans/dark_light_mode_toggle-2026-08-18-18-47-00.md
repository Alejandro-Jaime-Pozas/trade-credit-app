# Plan — dark/light mode toggle

**Date:** 2026-08-18
**Feature:** `dark_light_mode_toggle`
**Scope:** `frontend/` only. No backend / schema / API changes.

## Problem

Every colour in the app is a hardcoded Tailwind palette class (`bg-white`, `text-zinc-600`,
`border-red-200`, ...) spread over ~24 files, so there is no way to restate the UI in a second
theme. `globals.css` declares `--background`/`--foreground` under a
`@media (prefers-color-scheme: dark)` block, but nothing consumes them beyond `<body>`, and a
media query cannot be overridden by a user-facing button anyway.

## Approach: semantic tokens, not `dark:` variants

Two ways to do this:

- **A — `dark:` variants**: keep the palette classes and add a `dark:` twin to each of the
  ~400 colour utilities. Doubles every class list, and every future component has to remember
  to add its own twin or it silently breaks in dark mode.
- **B — semantic tokens (chosen)**: define the palette once in `globals.css` as CSS variables
  (`--color-surface`, `--color-fg-muted`, `--color-danger-line`, ...) whose *values* swap under
  `.dark`, expose them to Tailwind through `@theme inline`, and rewrite the components to use
  the token classes (`bg-surface`, `text-fg-muted`, `border-danger-line`). One class works in
  both themes, the diff is a rename rather than a duplication, and new components inherit dark
  mode for free.

Chosen B. It is the same amount of component churn as A on this pass and much less on every
pass after.

## Steps

1. **`frontend/src/app/globals.css`** — the token layer.
   - `@custom-variant dark (&:where(.dark, .dark *))` so class-based dark mode (a button can
     set it) replaces the `prefers-color-scheme` media query (a button cannot).
   - Light values on `:root`, dark values on `.dark`, both exposed via `@theme inline`.
   - Token groups: canvas/surface levels, foreground levels, borders, primary (buttons), and
     status ramps (danger / success / warning / accent), each with `-surface`, `-line` and
     solid variants where the app already used them.
   - `color-scheme` per theme so native scrollbars, selects and date pickers follow.
   - Base rules: default border colour = `--color-border` (Tailwind v4's bare `border` is
     `currentColor`, i.e. near-black today — it would be near-white in dark mode), and form
     controls get the surface/foreground tokens since many inputs carry no background class.

2. **`frontend/src/lib/theme.ts`** — the preference itself.
   - `localStorage` key `theme`, values `"light" | "dark"`; unset = follow the OS.
   - `useSyncExternalStore` rather than `useState` + `useEffect`: this repo's
     `set-state-in-effect` lint rule (see `docs/architecture/decisions.md`) rejects the usual
     mount-sync pattern, and the store form also gives cross-tab sync and OS-preference
     updates for free.
   - `THEME_INIT_SCRIPT`: a tiny blocking script string, applied in `<head>` before first
     paint so a dark-mode user never sees a white flash.

3. **`frontend/src/components/ThemeToggle.tsx`** — the button. Sun/moon icon, real
   `aria-label`/`title` describing the action, keyboard reachable as a plain `<button>`.

4. **`frontend/src/app/layout.tsx`** — run `THEME_INIT_SCRIPT` in `<head>`, add
   `suppressHydrationWarning` to `<html>` (the script mutates it before React hydrates).

5. **`frontend/src/components/AppShell.tsx`** — mount the toggle in the header, next to the
   auth actions, so it is on every screen (every page renders through `AppShell`).

6. **Component migration** — rewrite colour classes to tokens across `src/app/**` and
   `src/components/**`. `StatusDot`'s status colours stay literal: they are semantic signal
   colours (green/orange/red/yellow dots) that read correctly on both backgrounds, and the
   existing tests assert them.

7. **Tests** (`vitest`): new `lib/theme.test.ts` and `components/ThemeToggle.test.tsx` covering
   default-follows-OS, click switches and persists, stored preference wins over OS, and the
   accessible name. Then the full suite + `npm run lint` + `npm run build`.

8. **Docs** — append the token-layer decision to `docs/architecture/decisions.md` (Frontend),
   and write the implementation log.

## Risks

- Tailwind v4's bare `border` is `currentColor` today, so light-mode borders visibly lighten
  to zinc-200 once the base rule lands. This is a correction, not a regression, but it is a
  visible light-mode change and is called out here deliberately.
- Inputs with no `bg-*` class currently inherit whatever is behind them; they now get an
  explicit surface. Same story: needed for dark mode, mildly changes light mode.
