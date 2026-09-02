# Implementation — v2_pagare_expiry_and_verdict_deadline — 2026-08-31

Backend only, as instructed. No frontend files were touched.

## Files changed

| File | Change |
|---|---|
| `docs/versions/v2.md` | Scope section rewritten around the three items kept, with sizing notes and a "Known ceiling" note on client-side filtering |
| `docs/versions/v3.md` | New "Moved out of v2" section; also fixed its heading, which still read `# v2` from being copied |
| `docs/architecture/decisions.md` | Three new Backend entries (deadline computed not stored; clock start/stop; pagare not presence-only) |
| `backend/integrations/openai/services/pydantic_models/file_type_models.py` | `date_pattern_2000_to_future_year()` + `DATE_2000_TO_FUTURE_YEAR_PATTERN`; new `PagarePydantic`; corrected two now-stale docstrings that used the pagare as the presence-only example |
| `backend/core/file_type_catalog.py` | `pagare` now uses `PagarePydantic`; import added; stale docstring example corrected |
| `backend/integrations/openai/prompts/extract_file_data.py` | Year rule amended to exempt future-dated fields; pagare hint added |
| `backend/core/constants.py` | `DEFAULT_VERDICT_DAYS = 5` |
| `backend/identity/models.py` | `Organization.default_verdict_days` |
| `backend/identity/serializers.py` | Exposed `default_verdict_days` (writable) |
| `backend/processing/models.py` | `CreditCase.verdict_due_days` + five deadline properties |
| `backend/processing/serializers.py` | Override writable; four computed deadline fields read-only |
| `backend/processing/views.py` | `select_related('customer__organization')` |
| `backend/identity/migrations/0002_organization_default_verdict_days.py` | new |
| `backend/processing/migrations/0005_creditcase_verdict_due_days.py` | new |
| `backend/core/tests/test_file_type_catalog.py` | +2 pagare tests |
| `backend/processing/tests/models/test_verdict_deadline.py` | new, 12 tests |
| `backend/processing/tests/views_serializers/test_credit_case.py` | +4 API tests |
| `backend/identity/tests/views_serializers/test_organization_verdict_days.py` | new, 4 tests incl. tenant isolation on the newly writable field |

`backend/schema.yaml` and `frontend/src/lib/api.generated.ts` regenerated on their own — the
frontend container mounts `./backend` read-only and watches it. Verified by inspection that
all six new fields landed with correct types. No frontend source was edited.

## Item 3 needed no code

`Label` / `LabelValue` models, both viewsets, org scoping and `custom_fields` on
`CreditCaseSerializer` already existed, and `CreditCaseViewSet` already prefetched
`label_values__label`. The gap is entirely frontend and was left alone.

## Notable implementation points

**The pagare future-date trap.** `DateBaseModel`'s date fields are validated against a regex
capped at the current year. A `fecha_vencimiento` is in the future for every pagare that still
matters, so reusing `date_range_end` for it would have rejected exactly the documents the
field exists to read — and would have failed inside a Celery worker, after the OpenAI call was
paid for. Fixed with a separate forward-looking pattern and a separate field. The prompt
carried the same assumption in prose and was amended.

**Tenant isolation on a newly writable field.** `default_verdict_days` is writable, so a user
in one organization must not be able to change another's. `OrganizationViewSet.get_queryset()`
already limits a non-superuser to `request.user.organizations.all()`, so the attempt 404s.
Confirmed by reading the viewset AND pinned by
`test_user_cannot_change_another_organizations_default_verdict_days`.

**N+1 avoided deliberately.** `verdict_due_days_effective` falls back to
`customer.organization.default_verdict_days`. Without `select_related('customer__organization')`
the list endpoint would have fired two extra queries per row.

**Validators bite in different places.** `Organization.save()` calls `full_clean()`, so its
`MinValueValidator(1)` is enforced on any ORM save. `CreditCase.save()` does not, so its
validator is enforced by DRF at the API layer. Both paths are tested, and the tests say which
is which so the asymmetry is not mistaken for an oversight.

## Errors hit

1. **A `str.replace` guard caught a duplicate anchor.** The insertion anchor
   `def missing_file_type_names` appears TWICE in `processing/models.py` — once on `CreditCase`
   and once on another model — so an unguarded replace would have injected the deadline
   properties into the wrong class. The `assert count == 1` failed before anything was written;
   confirmed the file was untouched with `git diff --quiet`, then re-anchored on
   `label_values = GenericRelation(...)`, which is unique to `CreditCase`.
2. **Port 5432 was held by a native host Postgres**, so the DB container could not start.
   Resolved by the user freeing the port. No docker-compose change was made.

## Verification

```
pytest --create-db     252 passed, 6 skipped   (before the isolation tests)
pytest (final)         256 passed, 6 skipped
makemigrations --check No changes detected
sync_file_types        0 created, 0 updated, 22 unchanged
```

22 tests added in total. The delta was audited rather than assumed: test definitions went
222 (HEAD) -> 240 at the first count, exactly the 18 added by then, plus 4 tenant-isolation
tests after. Collected counts run higher than definition counts because
`test_browsable_api.py` is parametrized per endpoint.

A note for whoever reads an older log: an earlier session recorded a 209-passed baseline.
That number was stale, not a regression — verified by counting test definitions at HEAD
rather than trusting either figure.

## NOT verified

**No pagare has been through a live OpenAI call.** `PagarePydantic` is proven well-formed
against OpenAI's structural rules by test, and the future-date pattern is proven by test, but
whether GPT actually finds and fills `fecha_vencimiento` from a real pagare is unproven — that
spends real API calls. This is the one thing worth checking by hand before relying on the data.
