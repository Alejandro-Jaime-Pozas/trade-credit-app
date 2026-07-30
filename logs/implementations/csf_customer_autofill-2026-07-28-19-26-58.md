# Implementation Log — csf_customer_autofill — 2026-07-28

Auto-fill the linked `Customer`'s `rfc` and `legal_name` from a processed CSF document,
fill-only-if-empty. Backend only.

## Files changed

### `backend/storage/services/db_object_handling.py`
- Added import `from customers.models import Customer`.
- Added helper `promote_csf_fields_to_customer(doc)`:
  - No-op unless `doc.file_type_name == 'constancia_de_situacion_fiscal'` and `doc.extracted_data`.
  - Target: `doc.credit_case.customer` (guaranteed non-null in this handler).
  - Reads `rfc` / `razon_social` from `extracted_data` (empty string treated as absent).
  - `legal_name`: set only if currently blank.
  - `rfc`: set only if blank AND no `(organization, rfc)` collision — pre-checked with
    `Customer.objects.filter(...).exclude(pk=...).exists()`; on collision, skips rfc (prints a
    note) but still fills `legal_name`.
  - Writes with `customer.save(update_fields=[...] + ['updated_at'])` only when something changed.
- Called the helper from `handle_upload_document_created`, right after `file_type_name` is confirmed.

### `backend/storage/tests/services/test_promote_csf.py` (new) + `__init__.py` (new)
- pytest-django tests (`@pytest.mark.django_db`), building `Organization`/`Customer`/`CreditCase`
  inline and using unsaved `UploadDocument` instances. Cases: fill-when-blank; don't-overwrite;
  collision-skip-rfc-but-fill-legal-name; no-op for non-CSF; no-op for missing extracted_data.

## Verification
1. **New tests:** `docker compose exec backend pytest storage/tests/services/test_promote_csf.py -v`
   → **5 passed**.
2. **No regressions:** `docker compose exec backend pytest --continue-on-collection-errors -q`
   → **35 passed, 18 failed, 1 error**. The 35 = the prior 30-passing baseline + the 5 new tests;
   the 18 failures + 1 collection error are the same pre-existing deprecated-model / stale-import
   failures documented in `pytest_migration` (unchanged by this feature).

## Notes
- No model/serializer field changes → no migration and no `schema.yaml` / `api.generated.ts` regen.
- Frontend surfacing of the auto-filled `legal_name`/`rfc` and upload processing status deferred
  to a later round (per user scope).
