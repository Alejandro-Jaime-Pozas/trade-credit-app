# Plan Log — create_credit_case — 2026-06-18

## Files examined
- `ai/specs/frontend/fixes/2-create_credit_case.md`
- `ai/prompt_templates/fixes_prompt.md`
- `backend/processing/serializers.py`
- `frontend/src/app/credit-cases/new/page.tsx`
- `frontend/src/app/credit-cases/[id]/page.tsx`
- `frontend/src/app/credit-cases/page.tsx`
- `frontend/src/components/CustomerFormFields.tsx`
- `frontend/src/lib/creditCase.ts`, `api.ts`, `constants.ts`, `types.ts`

## What already existed
- `/credit-cases/new` — create credit case with new/existing customer toggle
- `/credit-cases/[id]` — edit requested_amount, currency, requested_term_days; required docs checklist; bulk file upload
- `CustomerFormFields.tsx` — reusable form with name, legal_name, rfc, all address fields

## Gaps identified
1. `assigned_to` field missing from credit case detail — backend had it commented out in serializer
2. `status` was read_only in serializer — no UI to change it
3. `/credit-cases/new` had no progressive disclosure — credit request fields always visible
4. `/credit-cases` list had no consistent ordering
5. `updated_at` not in API response — couldn't sort by it

## Approach
1. Expand backend serializer to expose `assigned_to` (writable) and `status` (writable), then `updated_at` (read-only)
2. Redesign `/credit-cases/new` as a true 2-step flow: link customer first, reveal credit case fields after
3. Add `status` + `assigned_to` selects to credit case detail
4. Sort credit cases list by `updated_at` desc on the frontend
