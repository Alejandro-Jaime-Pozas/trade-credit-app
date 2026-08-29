# Implementation — dark/light mode toggle

**Date:** 2026-08-18
**Feature:** `dark_light_mode_toggle`
**Scope:** `frontend/` only — no backend, database, API or CI changes.

## What was built

A theme button in the app header that switches the whole UI between light and dark, and a
dark theme for every existing screen.

Behaviour: with no choice stored the app follows the operating system (and keeps following it
if the OS setting changes); once the user clicks the button their choice is stored in
`localStorage` and wins from then on, in this tab and any other tab of the app. The theme is
applied before the page paints, so a dark-mode user never sees a white flash.

## Files added

| File | Purpose |
| --- | --- |
| `frontend/src/lib/theme.ts` | The preference itself: storage key, resolve/apply, the pre-paint script string, and the change subscription. Contains no React — the root layout is a Server Component and imports from it. |
| `frontend/src/lib/useTheme.ts` | The React binding (`useSyncExternalStore`), split out for the reason above. |
| `frontend/src/components/ThemeToggle.tsx` | The button. Moon in light mode, sun in dark mode, `aria-label` + `aria-pressed`. |
| `frontend/src/lib/theme.test.ts` | 18 tests: apply/read, stored-vs-OS precedence, junk in storage, the inline script (including the private-browsing case where `localStorage` throws), cross-tab sync, OS changes. |
| `frontend/src/components/ThemeToggle.test.tsx` | 5 tests: accessible name, click switches and switches back, choice persisted, loads correctly on an already-dark page. |

## Files changed

- **`frontend/src/app/globals.css`** — the design token layer. `@custom-variant dark` for
  class-based dark mode; light values on `:root`, dark values on `.dark`, both exposed via
  `@theme inline`. Token groups: `canvas`/`surface-*` (backgrounds), `fg-*` (text),
  `border`/`border-strong`, `primary-*` (the main action button), and the
  `danger`/`success`/`warning`/`accent` status ramps. Also `color-scheme` per theme so native
  scrollbars and dropdowns follow, a base rule pointing the default border colour at the token,
  and surface/foreground defaults for `input`/`select`/`textarea`.
- **`frontend/src/app/layout.tsx`** — runs `THEME_INIT_SCRIPT` as a plain inline `<script>` in
  `<head>`; `suppressHydrationWarning` on `<html>`.
- **`frontend/src/components/AppShell.tsx`** — mounts `<ThemeToggle />` in the header (every
  page renders through `AppShell`, so this is the one place that reaches all screens); page
  background moved to the `canvas` token.
- **22 other page/component files** — colour classes rewritten to tokens
  (`bg-white` → `bg-surface`, `text-zinc-600` → `text-fg-muted`,
  `border-red-200 bg-red-50 text-red-800` → `border-danger-line bg-danger-surface text-danger`,
  and so on). Mechanical, one source class to one token.
- **`frontend/src/components/Modal.tsx`** — the scrim gets `dark:bg-black/70`; a 40% black
  scrim over an already-dark page barely reads as one.
- **`frontend/src/components/FileTypeChooser.tsx`** — the submit button's text colour moved out
  of the shared base classes into each state, so the disabled state stops using white text on a
  light fill.
- **`docs/architecture/decisions.md`** — new "Colour lives in design tokens, not in components"
  entry under Frontend.
- **`docs/versions/v1.md`** — light/dark mode recorded under Frontend UI Views.

## Decisions worth knowing

- **Tokens, not `dark:` variants.** Same edit cost on this pass, much lower afterwards: one
  class works in both themes, and new components are themed by default. Full reasoning in
  `docs/architecture/decisions.md`.
- **A `dark` class, not `prefers-color-scheme`.** A media query cannot be overridden from
  inside the page, and the whole point here is a button.
- **`useSyncExternalStore`, not `useState` + `useEffect`.** The theme lives on `<html>`, outside
  React, and the repo's `react-hooks/set-state-in-effect` rule rejects the mount-sync pattern.
- **`StatusDot` keeps literal colours** — signal colours, not surfaces; they mean the same thing
  and read correctly on both backgrounds. Its existing tests still assert them.

## Two intentional light-mode changes

1. Tailwind v4 dropped the default border colour, so the app's bare `border` classes were
   painting in `currentColor` (near-black). They now use the border token, so light-mode borders
   are visibly lighter than before. This is a correction, but it is a visible one.
2. Inputs with no background class were transparent, which only looked fine because the
   background behind them was white. Form controls now carry the surface token explicitly.

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run` | 27 files, 325 tests passed (18 + 5 of them new) |
| `npx eslint src` | clean |
| `npx tsc --noEmit` | clean |
| `npx next build` | compiled successfully, all 11 routes generated |
| Built CSS inspected | `.dark` token block, token utilities (`.bg-surface{background-color:var(--surface)}`), the base border rule, and the `dark:` variant under `:where(.dark, .dark *)` all present |
| Built HTML inspected | the pre-paint theme script is inlined in `<head>` |

Not done: no browser screenshot of the running app — verification here is build, type, lint and
test level only.
