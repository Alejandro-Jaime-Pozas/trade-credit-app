# Prompt — dark/light mode toggle

**Date:** 2026-08-18
**Feature:** `dark_light_mode_toggle`

## Human prompt (verbatim)

> add button to website that allows user to toggle bw light mode and dark mode.
> implement dark/light mode design in current @frontend/ app.

## Interpretation

Two parts:
1. A visible control in the app chrome that switches the UI between light and dark.
2. The dark theme itself — every existing screen must be legible and consistent in dark
   mode, not just the header that holds the button.

Frontend-only. No backend, database, or API changes: the preference is a browser-local
display setting, not organization data.
