
# Decisions

## DB

- database atomicity:
  - currently making all db transactions atomic in settings.py with "ATOMIC_REQUESTS": True,
  - this hurts performance, will later need to switch..
  - INCLUDE @transaction.atomic MOVING FORWARD IF MULTI-STEP DB WRITE PROCESS, TO PREP LATER WHEN REMOVING GLOBAL SETTING


## Backend


## Frontend

- frontend testing:
  - Vitest + React Testing Library for unit/component tests (per `docs/architecture/architecture.md`'s Testing stack); Playwright/E2E deferred until there's a feature that needs it.
  - test files are colocated next to the source they cover (`foo.ts` -> `foo.test.ts`), not in a separate `__tests__/` tree.
  - `frontend/src/lib/` is the priority target: pure logic and auth/API plumbing carry more risk per line than page components, so it's covered first.
  - `frontend/src/lib/api.generated.ts` (openapi-typescript output) is excluded from the suite — it's type-only, no runtime behavior to test.
  - run via `make vitest` (mirrors `make pytest`); runs in Docker with `--no-deps` since these tests mock `fetch` and never need `backend`/`postgres-db` running.
