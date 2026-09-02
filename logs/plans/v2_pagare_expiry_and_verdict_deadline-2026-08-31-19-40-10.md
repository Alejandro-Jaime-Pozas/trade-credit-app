# Plan — v2_pagare_expiry_and_verdict_deadline — 2026-08-31

## Prior step: v2/v3 triage

Sized every Scope bullet in `docs/versions/v2.md` against what the codebase actually has.
The decisive finding was that **email is entirely greenfield** — no `EMAIL_BACKEND`, no SMTP
settings, no `send_mail` anywhere, no email package in `requirements.txt`, and no Celery Beat
service, so nothing can run recurring work at all. That one bullet outweighed the rest
combined, so it moved to v3 along with the AI verdict, the user-editable summary, SSO,
analytics querying, the documents dashboard, and Excel/PDF export. Each moved item was written
into `docs/versions/v3.md` under "Moved out of v2" with its reason.

## 1. Pagare expiry extraction

- New `PagarePydantic` in `file_type_models.py`: `fecha_vencimiento`, `monto`, `moneda`,
  `beneficiario`, `suscriptor`, on top of `DateBaseModel`.
- Point the `pagare` catalog row at it instead of `PresenceOnlyPydantic`.
- **The trap:** `DateBaseModel`'s date fields validate against a regex capped at the current
  year. A maturity date is in the future, so it needs its own forward-looking pattern
  (`DATE_2000_TO_FUTURE_YEAR_PATTERN`) and its own field rather than reusing `date_range_end`.
- The extraction prompt states the same past-only assumption in prose and must be amended.
- No migration: `pydantic_model` is not a synced field.

## 2. Verdict deadline

- `Organization.default_verdict_days` (`PositiveSmallIntegerField`, default 5, min 1).
- `CreditCase.verdict_due_days` (nullable override, min 1).
- Computed on `CreditCase`: `verdict_due_days_effective`, `verdict_due_at`,
  `days_since_created`, `days_until_verdict_due`, `is_verdict_overdue`.
- Clock starts at `created_at`, stops at `verdict_at` when a verdict exists.
- Expose on `CreditCaseSerializer` (override writable, the rest read-only) and
  `OrganizationSerializer` (default writable).
- `select_related('customer__organization')` on the viewset — the org fallback would
  otherwise fire extra queries per row on the list endpoint.
- Two migrations.

## 3. Labels as org-scoped filters

Investigated first. `Label` / `LabelValue` models, both viewsets, organization scoping and
`custom_fields` on `CreditCaseSerializer` all already exist, and `CreditCaseViewSet` already
prefetches `label_values__label`, so there is no N+1 to fix either. **No backend work
required.** What is missing is entirely frontend, which is out of scope for this change.

## Tests

- `processing/tests/models/test_verdict_deadline.py` (new) — fallback, override, both clock
  boundaries, negative-when-overdue, decided-case-stops-clock in both directions, the
  retroactive-default trade-off, and both validators.
- `processing/tests/views_serializers/test_credit_case.py` — deadline fields on the wire,
  override writable, zero rejected, computed fields read-only.
- `core/tests/test_file_type_catalog.py` — pagare is no longer presence-only; its due date
  accepts a future year while the issue-date fields stay capped.
