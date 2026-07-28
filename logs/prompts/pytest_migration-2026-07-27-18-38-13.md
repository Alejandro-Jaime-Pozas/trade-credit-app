# Prompt Log — pytest_migration — 2026-07-27

## User prompts (session)

1. **"you are tasked with migrating all of the tests that exist in this repo to pytest. plan."**
   - Requested a plan for migrating the backend test suite to pytest.

## Clarifications resolved (via AskUserQuestion)

- **Migration depth:** Mechanical + config only. Add pytest / pytest-django + config so
  existing `TestCase`/`SimpleTestCase` classes run under pytest unchanged. No function-style
  rewrite, no `factory_boy`, no file restructuring.
- **Stale tests:** Migrate faithfully as-is, then run and **report** pass/fail. Do not change
  test logic or app code to make deprecated-model tests green.

2. **(plan approved)** — user approved the plan; proceeded to implementation.
