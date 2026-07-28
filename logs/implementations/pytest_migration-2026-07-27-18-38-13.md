# Implementation Log — pytest_migration — 2026-07-27

Mechanical migration of the backend test suite to pytest. Existing `TestCase` /
`SimpleTestCase` classes are kept as-is (pytest-django runs unittest classes natively).

## Files changed

### `backend/requirements.txt`
- Added `pytest==8.3.4` and `pytest-django==4.9.0` (alphabetical position). Deferred
  `factory_boy` / `coverage` (not needed for a mechanical migration).

### `backend/pytest.ini` (new)
- `DJANGO_SETTINGS_MODULE = app.settings` (matches `manage.py`).
- `python_files = test_*.py`; `addopts = --reuse-db`.

### `backend/core/tests/obj_instances_global.py`
- Renamed all 8 helper factories to drop the `test_` prefix so pytest does not collect them
  as tests: `test_create_user_inst` → `create_user_inst`,
  `test_create_user_inst_with_organization` → `create_user_inst_with_organization`,
  `test_create_organization_with_user_inst` → `create_organization_with_user_inst`,
  `test_create_account_application_inst` → `create_account_application_inst`,
  `test_create_loan_account_application_inst` → `create_loan_account_application_inst`,
  `test_create_UploadDocument_inst` → `create_UploadDocument_inst`,
  `test_create_loan_verdict_ai_inst` → `create_loan_verdict_ai_inst`,
  `test_create_loan_verdict_inst` → `create_loan_verdict_inst`. Updated internal chained calls.

### Import/call sites updated (helper rename only — real test-method names untouched)
- `backend/identity/tests/models/test_user.py`
- `backend/identity/tests/models/test_company.py`
- `backend/processing/tests/utils/test_loan_agreement_pdf.py`
- `backend/processing/tests/models/test_loan_verdict.py`
- `backend/processing/tests/models/test_loan_verdict_ai.py`
- `backend/processing/tests/models/test_account_application.py`
- `backend/processing/tests/models/test_loan_agreement_document.py`
- `backend/processing/tests/models/test_loan_account_application.py`
- `backend/storage/tests/views_serializers/test_document.py`

### `README.md`
- Backend test command changed from `docker compose exec backend python manage.py test`
  to `docker compose exec backend pytest`.

## Verification

1. **Baseline** (`docker compose exec backend python manage.py test`, pre-rebuild):
   `Ran 49 tests` → **30 passed, 1 failure, 18 errors**.
2. **Rebuild**: `docker compose build backend` (installs pytest 8.3.4 + pytest-django 4.9.0),
   then `docker compose up -d backend`.
3. **Collect check** (`pytest --collect-only -q`): 48 tests collected, **no `create_*` helper
   collected as a test** (rename fix confirmed) + 1 pre-existing collection error.
4. **Full run** (`pytest --continue-on-collection-errors -q`):
   **30 passed, 18 failed, 1 error** in ~1.3s.

### Cross-check (migration is clean)
- **30 passed under both runners — identical.** No test that passed under `manage.py test`
  regressed under pytest. The migration introduced no failures.

### Pre-existing failures (out of scope — report only)
- **Collection error** — `storage/tests/views_serializers/test_document.py`:
  `ImportError: cannot import name 'ACCOUNT_APPLICATION_ID' from 'core.constants'` (stale constant).
- **`email_domain` validation** — helper Organizations use `mod_example.com` / `def_example.com`,
  rejected by the domain validator (identity tests, 5).
- **Deprecated models** — `AccountApplication` / `LoanAccountApplication` / `LoanVerdict` /
  `LoanVerdictAI` / `LoanAgreementDocument` tests (processing, 13). Superseded by the live
  `CreditCase` / `Customer` models.

All pre-existing failures are consistent with the Django baseline and match `TODO.md`
("recreate all tests from scratch since many errors/old deps"). Fixing them is a follow-up.
