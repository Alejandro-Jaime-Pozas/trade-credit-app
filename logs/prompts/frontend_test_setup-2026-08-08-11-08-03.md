# Prompt Log — frontend_test_setup — 2026-08-08 11:08:03

## User prompts (chronological, this feature thread)

1. "so there are no tests being created in frontend? should there be?"
2. (assistant recommended starting with Vitest + RTL on `frontend/src/lib/`)
3. "yes set up according to the architecture in @CLAUDE.md plan first"

## Clarifying answers given (via AskUserQuestion)

- Scope: Vitest + RTL only (Playwright deferred).
- Runner environment: Docker, matching the existing `make pytest` pattern.
- First test coverage: `frontend/src/lib/` logic, prioritized by risk (format.ts,
  api.ts pure helpers + fetch behavior, creditCase.ts, storage.ts).
