# Prompt Log — csf_customer_autofill_address — 2026-07-30

## User prompt (session)

> "execute the same code you did for passing the rfc and legal name from the upload document
> obj to the customer. The pydantic model for constancia de si... has been updated with those
> values and constraints. implement"

Follow-up to the earlier `csf_customer_autofill` feature (rfc + legal_name only). The CSF
pydantic model (`ConstanciaDeSituacionFiscalPydantic`) had since been extended with two new
required fields: `nombre_de_vialidad` and `codigo_postal`. Task: extend
`promote_csf_fields_to_customer` to also auto-fill those onto `Customer`, using the same
fill-only-if-empty pattern.
