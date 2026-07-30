# Plan Log — csf_customer_autofill — 2026-07-28

## Files examined
- `backend/storage/services/db_object_handling.py` — `handle_upload_document_created`, `create_friendly_file_name`.
- `backend/integrations/openai/services/pydantic_models/file_type_models.py` — `ConstanciaDeSituacionFiscalPydantic`.
- `backend/integrations/openai/services/gpt.py` — `run_gpt_file_data_extraction` (how `extracted_data` is saved).
- `backend/customers/models.py` — `Customer` (rfc validator, unique `(organization, rfc)` constraint).
- `backend/customers/constants.py` — `RFC_PERSONA_MORAL_LENGTH = 12`.
- `backend/processing/models.py` — `CreditCase.customer` (required FK).
- `backend/storage/models.py`, `storage/views.py`, `storage/serializers.py` — upload flow / FK linkage.
- `backend/identity/models.py` — `Organization` (full_clean-in-save, `validate_domain`).

## What already existed
- GPT extracts `rfc` + `razon_social` from a CSF and stores them in
  `UploadDocument.extracted_data` (dict), but nothing promotes them to `Customer`.
- `handle_upload_document_created(doc)` already requires `credit_case`; `CreditCase.customer`
  is a required FK, so `doc.credit_case.customer` is always reachable.
- A commented-out `if file_type_name == 'constancia_de_situacion_fiscal':` block marked the
  natural insertion point.

## Gaps identified
1. No code path writes extracted CSF fields to the `Customer`.
2. Two hazards: the `(organization, rfc)` unique constraint (a collision would roll back the
   whole atomic upload) and `Customer.save()` not calling `full_clean()`.

## Approach
1. Add `promote_csf_fields_to_customer(doc)` in `db_object_handling.py`; call it from
   `handle_upload_document_created` right after `file_type_name` is confirmed.
2. Write to `doc.credit_case.customer`, fill-only-if-empty. Guard `rfc` with an `exists()`
   pre-check against the org (never try/except-on-save inside the transaction). Rely on the
   pydantic 12-char `rfc` guarantee; no `full_clean()`.
3. Add pytest-django tests (`storage/tests/services/test_promote_csf.py`) using unsaved
   `UploadDocument` instances (helper reads only `file_type_name`, `extracted_data`,
   `credit_case.customer`).
4. No model/serializer changes → no migration, no schema/type regen. No frontend.
