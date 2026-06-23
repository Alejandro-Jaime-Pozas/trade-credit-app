# Implementation Log — create_credit_case — 2026-06-18

## Files changed

### `backend/processing/serializers.py`
- Uncommented `assigned_to` in `CreditCaseSerializer.fields` — now returned and accepted by the API
- Removed `status` from `read_only_fields` — PATCH can now change case status
- Added `updated_at` to `fields` and `read_only_fields` — exposed as read-only datetime

### `backend/schema.yaml`
- Regenerated via `python manage.py spectacular` (run inside Docker)

### `frontend/src/lib/api.generated.ts`
- Regenerated via `npm run api:generate` after backend schema update
- `CreditCase` type now includes `assigned_to?: string | null`, `status` (writable), `updated_at: string`

### `frontend/src/app/credit-cases/[id]/page.tsx`
- Added `status` select (all values from `CREDIT_CASE_STATUS_LABELS`) — editable, included in Save PATCH
- Added `assigned_to` select (fetches `/users/` list on load; shows email or full name) — editable, included in Save PATCH
- Verdict moved to a read-only display badge
- State synced from API response after Save

### `frontend/src/app/credit-cases/new/page.tsx`
- **Full redesign** — replaced old toggle (new/existing) with a unified 2-step flow:
  - **Step 1 — Link a customer**: single search input with live dropdown (filters existing customers as user types); "Create '[name]' as new customer" option in dropdown; create form shows only `Name` (required) by default; `(show more fields)` expands rfc, legal_name, and all address fields; selecting existing customer or creating new advances to Step 2 automatically
  - **Step 2 — Credit case details**: revealed only after customer confirmed; fields: requested_amount, currency, requested_term_days; submits and redirects to `/credit-cases` (overview)
- Progressive disclosure: Step 2 section is hidden via conditional render until `phase === "creditcase"`
- Success banner shown after customer creation before credit case form

### `frontend/src/app/credit-cases/page.tsx`
- Sort credit cases by `updated_at` desc after fetch (falls back to `created_at` if absent)
- Removed unused `React` import

### `frontend/src/lib/api.ts`
- Added `formatDrfError(body, fallback)` — converts DRF error response bodies into readable strings
  - `{"detail": "..."}` → the detail string
  - `{"rfc": ["Too short."]}` → "RFC: Too short."
  - `{"non_field_errors": ["Duplicate."]}` → "Duplicate."
  - Multiple fields joined with " · "
- Added `FIELD_LABELS` map for special-cased abbreviations (e.g. `rfc` → "RFC"); all other fields auto title-cased from snake_case
- Replaced duplicated `msg` logic in both `apiJson` and `apiForm` with the helper — improves error messages app-wide

## Verification
- `npx tsc --noEmit` — clean (only pre-existing `.next/` cache warning unrelated to this work)
- `./scripts/sync-api-schema.sh` — ran successfully; new fields confirmed in generated types
