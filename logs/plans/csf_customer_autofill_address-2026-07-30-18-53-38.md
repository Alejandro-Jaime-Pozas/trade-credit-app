# Plan Log — csf_customer_autofill_address — 2026-07-30

## Files examined
- `backend/integrations/openai/services/pydantic_models/file_type_models.py` —
  `ConstanciaDeSituacionFiscalPydantic` now requires `rfc`, `razon_social`,
  `nombre_de_vialidad`, `codigo_postal`.
- `backend/customers/models.py` — `Customer` already has `nombre_de_vialidad` (max_length=100)
  and `codigo_postal` (max_length=12) fields (part of a larger, currently-unused CSF-address
  field set on the model). No uniqueness constraints on either.
- `backend/storage/services/db_object_handling.py` — existing `promote_csf_fields_to_customer`
  from the prior `csf_customer_autofill` feature.

## What already existed
- `Customer` model already had the matching `nombre_de_vialidad` / `codigo_postal` fields
  (added ahead of time, unused until now) — **no migration needed**.
- `promote_csf_fields_to_customer(doc)` already handled `rfc` (with unique-constraint guard)
  and `legal_name` (plain fill-only-if-empty).

## Approach
Extend `promote_csf_fields_to_customer` to also read `nombre_de_vialidad` and `codigo_postal`
from `doc.extracted_data` and fill them onto `customer` fill-only-if-empty — same pattern as
`legal_name` (no collision risk, so no `exists()` pre-check needed, unlike `rfc`). Append to
`updated_fields` accordingly so they're included in the single `save(update_fields=...)` call.

Extend `storage/tests/services/test_promote_csf.py` to cover the two new fields: fill-when-blank,
don't-overwrite, still-fill-on-rfc-collision, and fill-independently-per-field.

No model/serializer changes, no migration, no frontend (consistent with the original feature's
backend-only scope).
