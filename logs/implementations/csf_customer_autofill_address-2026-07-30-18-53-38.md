# Implementation Log — csf_customer_autofill_address — 2026-07-30

Extended CSF→Customer auto-fill to also cover `nombre_de_vialidad` and `codigo_postal`, matching
the pydantic model's new required fields. Fill-only-if-empty, same as before. Backend only.

## Files changed

### `backend/storage/services/db_object_handling.py`
- `promote_csf_fields_to_customer(doc)`:
  - Now also reads `nombre_de_vialidad` and `codigo_postal` from `doc.extracted_data`.
  - Each fills onto `customer` only if currently blank — no collision check needed (no unique
    constraint on either field, unlike `rfc`).
  - Both appended to `updated_fields` when set, so they ride along in the existing single
    `customer.save(update_fields=[...] + ['updated_at'])` call.
  - Docstring/comment updated to mention the new fields.

### `backend/storage/tests/services/test_promote_csf.py`
- Extended `test_fills_rfc_and_legal_name_when_blank` and `test_does_not_overwrite_existing_values`
  to also assert on `nombre_de_vialidad` / `codigo_postal`.
- Renamed `test_skips_rfc_on_collision_but_still_fills_legal_name` →
  `test_skips_rfc_on_collision_but_still_fills_other_fields`; now also asserts the address fields
  still fill despite the rfc collision.
- Added `test_fills_only_blank_address_fields_individually` — confirms each address field fills
  independently (one already set, one blank).

## Verification
1. **New/updated tests:**
   `docker compose exec backend pytest storage/tests/services/test_promote_csf.py -v`
   → **6 passed** (was 5; added 1 new test).
2. **No regressions:** `docker compose exec backend pytest --continue-on-collection-errors -q`
   → **52 passed, 6 skipped**, 0 failed/errors.

## Notes
- No model/serializer field changes → no migration (the `Customer.nombre_de_vialidad` /
  `codigo_postal` columns already existed) and no `schema.yaml` / `api.generated.ts` regen.
- Frontend surfacing remains deferred, per the original feature's scope.
