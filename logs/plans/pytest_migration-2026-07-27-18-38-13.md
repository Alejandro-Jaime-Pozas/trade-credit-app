# Plan Log — pytest_migration — 2026-07-27

## Files examined
- `docs/architecture/architecture.md` — Testing stack (pytest + pytest-django, factory_boy, coverage.py).
- `docs/architecture/decisions.md` — `ATOMIC_REQUESTS: True` note.
- `CLAUDE.md`, `ai/execution_context/feature_context.md` — logging + workflow requirements.
- `ai/testing/python_init_testing_prompt.md` — the documented (idiomatic) test spec.
- `backend/requirements.txt`, `backend/app/settings.py`, `backend/manage.py`, `backend/Dockerfile`, `docker-compose.yml`.
- All 20 `backend/**/tests/test_*.py` files, plus shared helpers
  `backend/core/tests/obj_instances_global.py` and `backend/core/tests/constants_global.py`.

## What already existed
- ~50 tests across 20 files, 100% Django `unittest`-style (`TestCase` / `SimpleTestCase`).
- No pytest / pytest-django / factory_boy / coverage in `requirements.txt`.
- No `pytest.ini` / `conftest.py` / `pyproject.toml` / `setup.cfg` / `tox.ini` anywhere.
- Shared object-factory helpers named `test_create_*` in `obj_instances_global.py`, imported
  into the real `test_*.py` modules.
- Several tests target deprecated models (`AccountApplication`, `LoanAccountApplication`,
  `LoanVerdict`, `LoanVerdictAI`) — known to fail today (`TODO.md`).

## Gaps identified
1. pytest + pytest-django not installed; no pytest config wiring `DJANGO_SETTINGS_MODULE`.
2. Helper functions prefixed `test_create_*` would be collected by pytest as tests (imported
   into test modules), producing spurious errors.
3. README documented the old `python manage.py test` command.

## Approach (mechanical, low-risk)
1. Add `pytest==8.3.4` + `pytest-django==4.9.0` to `backend/requirements.txt`
   (defer factory_boy / coverage).
2. Add `backend/pytest.ini` with `DJANGO_SETTINGS_MODULE = app.settings`,
   `python_files = test_*.py`, `addopts = --reuse-db`.
3. Rename the 8 `test_create_*` helpers → `create_*` in `obj_instances_global.py` and update
   every import/call site — without touching real test-method names.
4. Update the README test command to `pytest`.
5. Keep all existing `TestCase`/`SimpleTestCase` classes unchanged (pytest-django runs them natively).
6. Verify: baseline `manage.py test` → rebuild image → `pytest --collect-only` → `pytest`,
   confirm same pass set, report pre-existing failures.

## Out of scope (follow-ups)
- Repair/quarantine deprecated-model tests against live `CreditCase`/`Customer`.
- Idiomatic pass: factory_boy + function-style + coverage per `ai/testing/python_init_testing_prompt.md`.
- Fill empty stub `backend/identity/tests/views_serializers/test_user.py`.
