# Frontend Test Setup — Vitest + React Testing Library

## Context

The frontend has **zero test infrastructure**: no test runner, no test files, no `test` script. Meanwhile `CLAUDE.md`'s Testing rule ("Any code implementation that warrants tests shall implement those tests, run them, and verify they pass") is not scoped to the backend, so it already applies to `frontend/` — the gap is an oversight, not a decision.

`docs/architecture/architecture.md` already sanctions **Vitest + React Testing Library + Playwright** ("Testing (if needed)"), so this is not a tech-stack change. Playwright is deliberately out of scope for this pass.

The target is `frontend/src/lib/` — ~700 lines of non-generated logic (auth token handling, DRF error formatting, the 401-retry/refresh path, credit-case body building). This is where a silent bug actually hurts, including the multi-tenant concerns `CLAUDE.md` calls out. UI components and E2E come later.

**Outcome:** `make vitest` runs a green frontend suite in Docker and tears the containers down after, mirroring `make pytest`.

---

## 1. Dependencies (`frontend/package.json`)

Add to `devDependencies` — all sanctioned by architecture.md or required to run it:

| Package | Why |
|---|---|
| `vitest` | The runner named in architecture.md |
| `@vitejs/plugin-react` | JSX/Fast-Refresh transform for React 19 `.tsx` (needed for `auth.tsx`) |
| `jsdom` | Browser-like env — `localStorage`, `atob` used by `api.ts`/`storage.ts` |
| `vite-tsconfig-paths` | Resolves the `@/*` → `./src/*` alias from `tsconfig.json` |
| `@testing-library/react` | RTL, named in architecture.md |
| `@testing-library/dom` | RTL v16 peer dep |
| `@testing-library/jest-dom` | `toBeInTheDocument` etc. matchers |
| `@testing-library/user-event` | Realistic interaction for future component tests |

Scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

> Per `ai/workflows/feature.md` ("Ask before adding new dependencies") this list is the thing to approve — the tools themselves are pre-named in architecture.md.

## 2. `frontend/vitest.config.mts`

New file (`.mts` — already covered by `tsconfig.json`'s `include`).

- `plugins: [react(), tsconfigPaths()]`
- `test.environment: "jsdom"`, `test.globals: true`
- `test.setupFiles: ["./vitest.setup.ts"]`
- `test.env: { TZ: "UTC", NEXT_PUBLIC_API_BASE_URL: "http://test-api/api/v1" }` — pins both sources of nondeterminism: `formatDate` uses bare `toLocaleString()`, and `api.ts:96` reads the base URL at call time.
- `test.exclude`: defaults + `src/lib/api.generated.ts` (2729 lines, type-only)

## 3. `frontend/vitest.setup.ts`

New file: `import "@testing-library/jest-dom/vitest"`, plus an `afterEach` calling RTL `cleanup()` and `localStorage.clear()` — `api.ts` persists tokens under `tca.accessToken`/`tca.refreshToken`, which would otherwise leak between tests.

## 4. Test files (colocated `*.test.ts` next to source)

Prioritized by bug-risk-per-effort. Follow the backend's current pytest house style — plain `assert`-equivalent expectations, plain-English test names, a module docstring stating coverage, and a beginner-legible comment on any non-obvious setup (per `CLAUDE.md` Documentation + `feature.md`'s comment example).

**`src/lib/format.test.ts`** — pure, start here.
- `formatDate`: `null`/`undefined`/`""` → `"—"`; unparseable string echoed back verbatim; valid ISO returns a non-`"—"` string.
- `formatMoney`: `null`/`undefined` → `"—"`; `NaN` → `"—"`; `formatMoney("1500000.00", "MXN")` → `"MXN 1,500,000.00"` (the documented example at `format.ts:14`); no currency → grouped number only; **bad currency code falls back** to `` `${currency} ${grouped}` `` (the `catch` at `format.ts:35`); document the `formatMoney("")` → `"0.00"` quirk (`Number("")` is `0`, so it never hits the `NaN` guard) as a characterization test.

**`src/lib/api.pure.test.ts`** — no fetch needed.
- `formatDrfError` (`api.ts:67`): string body; `{detail}`; `{field: [msgs]}` → `"Field: a, b"`; `non_field_errors` → label suppressed; mixed → joined with `" · "`; `rfc` → `"RFC"`; empty object → fallback.
- `decodeJwtPayload` (`api.ts:150`): valid base64url payload; `-`/`_` substitution; <2 segments → `null`; garbage → `null`.
- `isAccessTokenExpired` (`api.ts:161`): future `exp` → false; past → true; **missing `exp` → true**; the 30s skew boundary (use `vi.setSystemTime`).
- `getUserIdFromAccessToken` (`api.ts:167`): number; numeric string; non-numeric string → `null`; missing → `null`. Note `auth.tsx`'s `if (!userId)` rejects a legitimate `user_id === 0` — cover it as a characterization test.

**`src/lib/api.fetch.test.ts`** — `vi.stubGlobal("fetch", vi.fn())`.
- `toUrl` behavior: relative path prefixed with base; absolute `http(s)://` passed through unchanged (DRF `next` links depend on this).
- `apiJson({auth: false})` sends **no** `Authorization` header (login/signup path).
- Authenticated request attaches `Bearer` and forces `cache: "no-store"`.
- **401 → refresh → retry once**, and does not retry a second time (`api.ts:267`).
- Refresh failure clears stored tokens.
- Single-flight `refreshPromise` (`api.ts:178`): two concurrent calls issue **one** `/auth/refresh/` request. Module-level mutable state — use `vi.resetModules()` + dynamic `await import("./api")` per test so it doesn't leak.
- `safeFetch` network `TypeError` → `ApiError` with `status: 0` and the "Is the backend running?" message.
- `drfListAll` walks `next` pages and concatenates `results`.

**`src/lib/creditCase.test.ts`** — `vi.mock("./api")`.
- `listCreditCasesForCustomer` filters by `customer` URL and sorts `created_at` descending.
- `getOrCreateCreditCaseForNewCustomer`: existing case → PATCH; none → POST.
- The `hasUpdates` short-circuit (`creditCase.ts:64`) — returns the existing case **without** an API call when no fields are set.
- `buildCreditCaseBody`: whitespace-only `requestedAmount` dropped, `"0"` kept, camelCase → snake_case mapping.

**`src/lib/storage.test.ts`** — needs `// @vitest-environment node` at the top of the file to exercise the `typeof window === "undefined"` SSR guards; jsdom would always have `window`.

## 5. Docker wiring

`frontend` in `docker-compose.yml:30` declares `depends_on: backend`, which transitively pulls in `postgres-db`. These tests mock `fetch` entirely, so **`--no-deps`** keeps the DB out of it.

Add to `Makefile`:
```make
# Run the frontend Vitest suite in a one-off container. --no-deps skips
# backend/postgres-db: these tests mock fetch and never hit the API.
vitest:
	docker compose run --rm --no-deps frontend npm test; docker compose down

# Run both suites.
test: pytest vitest
```

**Also fix two existing Makefile bugs found while reading it:**
- `down -v` (line 17) is not a valid target name — the space makes Make parse it as two targets. Rename to `down-v` (which `.PHONY` on line 1 already expects).
- `.PHONY` lists `test` but the backend target is named `pytest`; add `pytest`/`vitest` and keep `test` as the combined target above.

**Gotcha to expect:** `frontend-node-modules` is a named volume (`docker-compose.yml:28`) that shadows the image's `node_modules`. Newly added devDeps will **not** appear until the volume is refreshed — run `make down-v` then `make build`, or `docker compose run --rm --no-deps frontend npm install` once.

## 6. Docs

- Fill the empty `## Frontend` section in `docs/architecture/decisions.md` with the decision: Vitest + RTL for unit/component, colocated `*.test.ts`, `lib/` prioritized, Playwright deferred.
- Add the `make vitest` command to `README.md` next to the existing `docker compose exec backend pytest`.
- Per `ai/execution_context/feature_context.md`, write `logs/prompts/`, `logs/plans/`, and `logs/implementations/` entries named `frontend_test_setup-2026-08-08-<hh-mm-ss>.md`.

---

## Verification

1. `make build` (picks up the new devDeps past the node_modules volume).
2. `make vitest` — suite runs green, and `docker compose ps` afterward shows **no** leftover containers (confirms teardown, and that `postgres-db` never started).
3. `docker compose run --rm --no-deps frontend npx tsc --noEmit` — test files typecheck under `strict: true`.
4. `docker compose run --rm --no-deps frontend npm run lint` — flat ESLint config still passes with the new files.
5. Confirm determinism: run `make vitest` twice; the `es-MX` money assertions and TZ-sensitive date assertions must produce identical results. If `node:20-alpine` turns out to lack full ICU, `es-MX` silently degrades to `en-US` — if that happens, add `NODE_ICU_DATA`/`full-icu` rather than loosening the assertions.
6. `make pytest` still passes unchanged (no backend impact).
