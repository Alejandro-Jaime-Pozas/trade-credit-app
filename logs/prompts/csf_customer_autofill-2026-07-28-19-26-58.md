# Prompt Log — csf_customer_autofill — 2026-07-28

## User prompts (session)

1. **"plan out implementing the missing mv on to passing extracted fields to proper models
   (rfc to customer/credit case, etc) and improving frontend UI. ... before planning, get me the
   fields currently being extracted by file type ... and the fields for Customer and Credit Case ..."**
   - Requested a field inventory first, then a plan to pass extracted document fields onto the
     proper models.

## Decisions resolved (via AskUserQuestion + follow-ups)

- **(a) CSF schema:** keep simple — only `rfc` + `razon_social` (no address extraction yet).
- **(b) Financial extractions:** ignore for now (stay in `UploadDocument.extracted_data`).
- **(c) Target behavior:** auto-fill the related `Customer` object from the CSF extraction.
- **Fill semantics:** fill-only-if-empty (never overwrite user-entered values).
- **Frontend:** no frontend implementation this round — backend only.
