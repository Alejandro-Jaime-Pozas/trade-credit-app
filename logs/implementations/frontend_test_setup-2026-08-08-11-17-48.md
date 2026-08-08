# Implementation Log — frontend_test_setup — 2026-08-08

## Summary

Added Vitest + React Testing Library to the frontend and wrote the first
batch of unit tests, covering `frontend/src/lib/` (the highest-risk,
UI-independent logic: auth/API plumbing, DRF error formatting, credit-case
body building, display formatting, SSR-safe storage). Playwright/E2E was
explicitly deferred per the user's scoping decision.

Plan: `logs/plans/frontend_test_setup-2026-08-08-11-08-03.md`
Prompt: `logs/prompts/frontend_test_setup-2026-08-08-11-08-03.md`

## Dependencies (`frontend/package.json`)

Added to `devDependencies`: `vitest`, `@vitejs/plugin-react`, `jsdom`,
`vite-tsconfig-paths`, `@testing-library/react`, `@testing-library/dom`,
`@testing-library/jest-dom`, `@testing-library/user-event`. Added scripts
`test` (`vitest run`) and `test:watch` (`vitest`).

## New config files

- `frontend/vitest.config.mts` — jsdom environment, `@/*` alias via
  `vite-tsconfig-paths`, pins `TZ=UTC` and `NEXT_PUBLIC_API_BASE_URL` so
  date/URL assertions are deterministic, excludes the generated
  `api.generated.ts` from collection.
- `frontend/vitest.setup.ts` — loads `@testing-library/jest-dom/vitest`
  matchers; `afterEach` runs RTL `cleanup()` and clears `localStorage`
  (guarded for the Node-environment test file, which has no `localStorage`
  global at all).

## Test files (colocated `*.test.ts`)

- `src/lib/format.test.ts` — `formatDate`/`formatMoney` null/NaN/bad-currency
  fallbacks, plus two characterization tests: `formatMoney("")` returns
  `"0.00"` (not `"—"`, since `Number("")` is `0`), and the es-MX currency
  format uses a non-breaking space (U+00A0) between the code and the amount
  — the docstring's example in `format.ts:14` uses a regular space and is
  technically inexact (not changed; out of scope for this pass).
- `src/lib/api.pure.test.ts` — `formatDrfError` (all body shapes),
  `decodeJwtPayload`, `isAccessTokenExpired` (incl. the 30s skew boundary via
  `vi.setSystemTime`), `getUserIdFromAccessToken` (incl. a characterization
  test for `user_id: 0`, which the `auth.tsx` caller's `if (!userId)` would
  treat as "missing").
- `src/lib/api.fetch.test.ts` — URL building (relative vs. absolute), auth
  header behavior, the 401 → refresh → retry-once flow (and that it doesn't
  retry a second time), refresh failure clearing stored tokens, the
  single-flight `refreshPromise` (via `vi.resetModules()` + dynamic
  `import("./api")` to isolate the module-level state), `safeFetch`'s
  network-error wrapping, and `drfListAll`'s pagination walk. All fetch calls
  are stubbed with `vi.stubGlobal("fetch", ...)`.
- `src/lib/creditCase.test.ts` — `./api` mocked via `vi.mock`; covers the
  existing-case-PATCH vs. no-case-POST branch, the `hasUpdates` no-op
  short-circuit, and `buildCreditCaseBody`'s trimming/camelCase-mapping
  rules.
- `src/lib/storage.test.ts` — `// @vitest-environment node` override (the
  suite default is jsdom, which always has `window`) to actually exercise
  the `typeof window === "undefined"` SSR guards.

## Docker / Makefile

- `Makefile`: added `vitest` target (`docker compose run --rm --no-deps
  frontend npm test; docker compose down`) — `--no-deps` skips
  `backend`/`postgres-db` since these tests mock `fetch` and never need a
  live API. Added `test: pytest vitest` as a combined target, and added
  `pytest`/`vitest` to `.PHONY`.
  (Note: the `down -v` → `down-v` naming bug and a separate `build-nc`
  no-cache target were fixed/added independently by the user while this
  work was in progress; left as-is.)
- `README.md`: documented `docker compose exec frontend npm test` and the
  `make pytest`/`make vitest`/`make test` shortcuts next to the existing
  backend test docs.
- `docs/architecture/decisions.md`: filled in the previously-empty
  `## Frontend` section with the testing decision (Vitest + RTL, colocated
  test files, `lib/` prioritized, Playwright deferred, run via `make
  vitest`).

## Gotcha hit during verification

`frontend-node-modules` (a Docker named volume) predated this change and
shadowed the image's `node_modules` at runtime, so the new devDeps weren't
visible to a plain `docker compose build`. Rather than running the
destructive `make down-v` (which also wipes `postgres-data`, i.e. the local
dev database), only the `frontend-node-modules` volume was removed and
recreated via `docker compose run --rm --no-deps frontend npm install`.

## Verification (all passed)

1. `docker compose build frontend` — image rebuilt, `npm ci` picked up the
   new devDeps.
2. `make vitest` — 5 test files, 54 tests, all passed inside the container
   (`node:20-alpine`; confirmed no ICU degradation issue for the es-MX
   currency formatting). `docker compose ps` afterward showed zero leftover
   containers, and only the `frontend` one-off container was ever created
   (confirms `--no-deps` kept `postgres-db` from starting).
3. `npx tsc --noEmit` — test files typecheck clean under `strict: true`.
4. `npm run lint` — 0 errors, 0 warnings.
5. `make pytest` — unchanged, 79 passed / 6 skipped. No backend impact.

## Deviations from the plan

None. Scope, dependency list, file layout, and Docker wiring match
`logs/plans/frontend_test_setup-2026-08-08-11-08-03.md` as approved.
