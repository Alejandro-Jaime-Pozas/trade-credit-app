# Fix live cross-tenant write gaps — extend `OrganizationScopedMixin` to cover writes

## Context

`OrganizationScopedMixin` was meant to scope **any** user action to their organization, but today it
only implements `get_queryset` — i.e. reads. On write, DRF auto-generates each ForeignKey field with an
unfiltered `Model.objects.all()` queryset, so nothing stops a user from POSTing a link to another
organization's row.

Result: a user can create records that *read back* as their own (because the org field is forced or
derived) while the FK actually points at another tenant's data — e.g. upload a document straight onto
another org's credit case. This violates the multi-tenant rule now written into `CLAUDE.md`.

The fix stays in **one mixin**: alongside `organization_lookup` (reads), add
`organization_scoped_fields` (writes), applied by hooking `get_serializer()`. Both halves of the rule
are then declared in the same place, on the viewset.

**Gaps being closed** (all reachable via registered endpoints today):

| ViewSet | Unscoped writable FK |
|---|---|
| `CreditCaseViewSet` | `customer`, `assigned_to` |
| `CustomerContactViewSet` | `customer` |
| `UploadDocumentViewSet` | `customer`, `credit_case` |

Out of scope: the dead `AccountApplication` chain (routes commented out in `processing/urls.py`) and
the `UploadDocument`/`DocumentDataExtract` read-visibility TODOs.

## 1. Relocate mixins to the shared app — `app/mixins.py` → `core/mixins.py`

`app/` is the Django **project configuration** package (`settings.py`, `urls.py`, `wsgi.py`,
`asgi.py`); shared library code conventionally belongs in a shared app, which this repo already has and
already uses for exactly this kind of code (`core/constants.py`, `core/validators.py`,
`core/serializer_utils.py`, `core/str_utils.py`). `app/mixins.py` is the lone inconsistency.

- `git mv backend/app/mixins.py backend/core/mixins.py` (preserves history).
- Update the 4 importers to `from core.mixins import OrganizationScopedMixin`:
  `customers/views.py:3`, `identity/views.py:4`, `processing/views.py:6`, `storage/views.py:13`.
- `core` is already in `INSTALLED_APPS` (`app/settings.py:54`), and `mixins.py` imports nothing, so
  there is no circular-import or app-registry risk.
- Leave `app/middleware.py` where it is — middleware is referenced from `settings.py` by dotted path,
  so it is genuinely config-adjacent.

## 2. Extend the single mixin to cover writes — `backend/core/mixins.py`

Keep `get_queryset` exactly as-is; add a second declarative attribute and a `get_serializer` hook:

```python
class OrganizationScopedMixin:
    """
    Scope every user action on a view to the user's organization(s).

    Two halves, because Django and DRF enforce them in different places:

    - READS  — `organization_lookup` filters the queryset, so a user only ever sees
      their own organization's rows.
    - WRITES — `organization_scoped_fields` narrows the ForeignKey fields the user is
      allowed to point AT. Without this, DRF builds every FK field with an unfiltered
      `Model.objects.all()`, so a user could POST a link to another organization's row
      and attach their record to another tenant's data.

    Example on a viewset:

        organization_lookup = 'customer__organization'
        organization_scoped_fields = {'customer': 'organization'}

    `organization_lookup` is the ORM path from THIS view's model to Organization;
    each value in `organization_scoped_fields` is the path from THAT FIELD's model
    to Organization.
    """

    organization_lookup = None
    organization_scoped_fields = {}

    def get_queryset(self):
        ...  # unchanged

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)

        user = self.request.user
        if not self.organization_scoped_fields or not user.is_authenticated or user.is_superuser:
            return serializer

        orgs = user.organizations.all()
        # With many=True DRF returns a ListSerializer wrapper; the actual fields live
        # on its `.child`.
        fields = getattr(serializer, 'child', serializer).fields

        for field_name, org_lookup in self.organization_scoped_fields.items():
            field = fields.get(field_name)
            # Read-only fields carry no queryset, so there is nothing to protect.
            if field is None or getattr(field, 'queryset', None) is None:
                continue
            field.queryset = field.queryset.filter(**{f'{org_lookup}__in': orgs}).distinct()

        return serializer
```

Why narrow the queryset rather than add per-field `validate()` calls: it fixes validation **and** the
browsable-API dropdown at once, applies to POST/PUT/PATCH alike, and an out-of-scope id returns a
generic "object does not exist" — it never reveals whether that id exists in another org.

## 3. Declare the scoped fields on the viewsets

**`backend/processing/views.py` — `CreditCaseViewSet`**
```python
    organization_lookup = 'customer__organization'
    organization_scoped_fields = {
        'customer': 'organization',
        'assigned_to': 'organizations',  # User -> Organization m2m (identity.Organization.users)
    }
```

**`backend/customers/views.py` — `CustomerContactViewSet`**
```python
    organization_lookup = 'organization'
    organization_scoped_fields = {'customer': 'organization'}
```

**`backend/storage/views.py` — `UploadDocumentViewSet`**
```python
    organization_scoped_fields = {
        'customer': 'organization',
        'credit_case': 'customer__organization',
    }
```

**Required companion fix:** `UploadDocumentViewSet.create()` currently builds its serializer directly
(`self.serializer_class(data=request.data, context=self.get_serializer_context())`, storage/views.py:66),
which bypasses `get_serializer` and would skip the new scoping entirely. Change it to
`self.get_serializer(data=request.data)` — the DRF-idiomatic call, which supplies the same context.

**Also migrate `LabelValueViewSet`** to `organization_scoped_fields = {'label': 'organization'}` and
delete the now-redundant `__init__` from `LabelValueSerializer` (storage/serializers.py:197-210). That
bespoke narrowing was the prototype for this mixin; folding it in leaves one pattern instead of two.
Its `validate()` stays untouched — it enforces a stricter rule the mixin can't express (the target
object must be reachable from the *label's* org). Existing tests in
`storage/tests/views_serializers/test_label.py` cover this refactor.

## 4. Model-specific rules that stay in serializers

These are business rules, not generic scoping, so they don't belong in the mixin.

**`backend/customers/serializers.py` — `CustomerContactSerializer`**
```python
    def validate(self, attrs):
        """
        Keep `organization` in lockstep with the customer's own organization. These are
        two separate columns that could otherwise disagree, and the unique
        (organization, email) constraint is only meaningful if `organization` always
        matches the customer the contact actually belongs to.
        """
        customer = attrs.get('customer') or getattr(self.instance, 'customer', None)
        if customer:
            attrs['organization'] = customer.organization
        return attrs
```
Doing this in `validate()` (not `perform_create`) covers PATCH too, so re-pointing a contact at a
different customer can't leave a stale `organization`.

Constraint check: this *strengthens* `unique_customer_contact_email_per_organization`. `organization`
is nullable and Postgres skips NULLs in unique constraints; deriving it from the non-null
`Customer.organization` makes it reliably populated, so the constraint is enforced on every row. The
existing explanatory comment on the field stays as-is.

**`backend/storage/serializers.py` — `UploadDocumentSerializer.validate()`**: keep the current "at
least one of credit_case/customer" check and add:
```python
        # Both FKs are optional and independent, so a user belonging to more than one
        # organization could otherwise link a document to a customer in org A and a
        # credit case in org B, leaving one row visible from two tenants.
        customer = attrs.get('customer')
        credit_case = attrs.get('credit_case')
        if customer and credit_case and credit_case.customer_id != customer.id:
            raise serializers.ValidationError(
                'credit_case and customer must belong to the same customer record.'
            )
```

## 5. Two remaining view fixes

- **`customers/views.py` — `CustomerContactViewSet.perform_create`**: drop the
  `organization=self.request.user.organizations.first()` kwarg (the serializer derives it now); keep
  `created_by=self.request.user`. `save()` kwargs override `validated_data`, so leaving it would defeat
  step 4.
- **`storage/views.py` — `UploadDocumentViewSet.create`**: change `serializer.save()` (line 68) to
  `serializer.save(uploaded_by=request.user)`. The field exists on the model but is never populated,
  because this custom `create()` bypasses `perform_create`.

`CreditCaseViewSet` needs no further change (the model has no `created_by`).

## 6. Tests

Follow the modern pytest style of `storage/tests/views_serializers/test_label.py` — module-level
`make_org` / `make_user_in_org` / `make_client_for` / `make_customer` helpers, `@pytest.mark.django_db`
functions, hyperlinked URLs via `reverse('<basename>-detail', args=[id])`. Model on
`test_label_value_rejects_using_another_organizations_label` (test_label.py:138-171): build `org` +
`other_org`, authenticate as a user in `org`, POST a cross-org FK, assert 400 **and** that no row was
created. Remember `Organization.save()` runs `full_clean()`, so `email_domain` must look like a real
domain.

New files:
- `backend/customers/tests/__init__.py` + `views_serializers/__init__.py` (dir exists but is empty)
  and `test_customer_contact.py` — reject another org's `customer`; `organization` is derived from
  `customer.organization` (not the user's first org); same-org create still succeeds.
- `backend/processing/tests/views_serializers/__init__.py` + `test_credit_case.py` — reject another
  org's `customer`; reject another org's user as `assigned_to`; same-org create still succeeds.
- `backend/storage/tests/views_serializers/test_upload_document_tenant_isolation.py` — reject another
  org's `customer`; reject another org's `credit_case`; reject a mismatched customer/credit_case pair;
  `uploaded_by` is set on successful upload. Mock the side effect exactly as the existing file does:
  `@patch('storage.views.handle_upload_document_created', return_value={'skipped': True})`.

Helpers stay duplicated per-file to match the two existing modern test files. Consolidating them into a
`conftest.py` is a worthwhile but separate cleanup — flagged, not done here.

## 7. Feature logs (required by `ai/execution_context/feature_context.md`)

Write `logs/prompts/`, `logs/plans/`, `logs/implementations/` entries named
`organization_scoped_writes-<yyyy-mm-dd-hh-mm-ss>.md`, plus `logs/errors/` if anything fails.

## Verification

1. `grep -rn --include="*.py" "app.mixins" backend/` — must return nothing after the move.
2. `docker compose exec backend pytest -q` — new tests pass and the existing suite has no regressions
   (`pytest.ini` uses `--reuse-db`; no migrations here, so no `--create-db` needed). This also proves
   the relocated import path resolves in all 4 viewset modules and that the `LabelValueSerializer`
   refactor is behavior-preserving.
3. `docker compose exec backend python manage.py makemigrations --check --dry-run` — clean; this change
   is view/serializer-only and must produce no model changes.
4. `./scripts/sync-api-schema.sh` — field *types* don't change (still hyperlinked FKs), so expect no
   `schema.yaml` / `api.generated.ts` diff. If a diff does appear, commit it and run
   `cd frontend && npx tsc --noEmit`.
5. Manual check against the running stack, authenticated as a user in org A:
   - POST a `CreditCase` with org B's `customer` (and separately, org B's user as `assigned_to`) → 400,
     no row created.
   - POST a `CustomerContact` with org B's `customer` → 400; a same-org contact comes back with
     `organization == customer.organization`.
   - POST an `UploadDocument` with org B's `credit_case` → 400; a valid upload has `uploaded_by` set.
   - Confirm normal same-org creates for all three still return 201 (no over-blocking).
