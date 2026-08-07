# Error Log — label_dynamic_custom_fields — 2026-08-03

## Report (verbatim)

> i'm creating via http://localhost:8000/api/v1/label-values/ linking to the label, obj but it
> seems the label values don't persist. the label does, but labelvalue does not persist, what's
> wrong?
>
> i created label with admin@example.com sucursal. then i logged out, logged in with diff creds
> and org goblin@gringotts.com. then a few errors:
>
> 1. label already appeared though that org had none (it was the admin@example.com label)
> 2. labelvalues created did not appear in this org, but when i logged in via admin@example.com,
>    the labels appeared there..so you're missing the permissions for those in your code

## Diagnosis

First ruled out "doesn't persist" literally — a direct DB read showed the `LabelValue` rows the
user created *were* actually saved (`id=1, value='MTY NTE'`, `id=2, value='MTY SUR'`, both under
`content_type=creditcase`). So this was never a write failure — it was a **cross-tenant
authorization bug**.

Confirmed via `django.test.Client` + `force_login` (bypassing the browser/session entirely, to
rule out a browser-cache explanation) that `GET /labels/` and `GET /label-values/` were correctly
scoped: goblin (org `Gringotts`) got `0` results for both, admin (superuser, org `Example`) saw
the real data. So **reads were fine**.

The actual hole was in `LabelValueSerializer` (create path):
- The `label` field is a `HyperlinkedModelSerializer`-auto-generated FK. Its default queryset is
  `Label.objects.all()` — **not scoped to the requesting user's organization** — so any
  authenticated user's create-form dropdown lists every organization's labels, and any
  authenticated user can POST any other org's label id/URL.
- `validate()` only checked that the *target object* (`object_id`) was reachable via "some org the
  requesting user belongs to." It never checked that the **label itself** belonged to that same
  user/org. So a user could pick another organization's label and attach it to one of their own
  objects — the check that existed was necessary but not sufficient.

**Reproduced exactly** with `django.test.Client`, `force_login(goblin)`, POSTing admin's
`sucursal` label (org `Example`) against goblin's own CreditCase (org `Gringotts`):
- `POST /api/v1/label-values/` → `200`, value written and immediately visible in
  `GET /credit-cases/<id>/` → `custom_fields: {"sucursal": "HIJACKED"}` (goblin's own CreditCase!).
- But `GET /api/v1/label-values/` as goblin → `{"count": 0, ...}`, because the created row's
  `label.organization` is `Example`, not `Gringotts` — invisible to goblin's own scoped list, only
  visible to admin (superuser sees everything). This exactly matches both reported symptoms.

## Fix — `backend/storage/serializers.py`, `LabelValueSerializer`

1. Added `__init__` override: for authenticated non-superusers, narrows `self.fields['label'
   ].queryset` to `Label.objects.filter(organization__in=request.user.organizations.all())` — so
   another org's label is no longer even a valid choice (closes the create-form leak, report #1).
2. Hardened `validate()`:
   - New check: reject unless `label.organization_id` is one of the requesting user's
     organizations (unless superuser) — this is the check that was missing entirely.
   - Changed the existing object-reachability check from "reachable via *any* org the user
     belongs to" to "reachable via *the label's own* organization" specifically — so label and
     target object are now required to belong to the same org, not just each be independently
     visible to the requesting user.

## Verification
1. Reproduced the exact attack again post-fix via `django.test.Client` + `force_login(goblin)`:
   `POST /api/v1/label-values/` with admin's label + goblin's own CreditCase →
   **`400 Bad Request`**, `{"label": ["Invalid hyperlink - Object does not exist."]}` (rejected at
   the field-choice level, before even reaching `validate()`).
2. Confirmed the legitimate flow still works: goblin creates his own `sucursal` label
   (`organization` auto-set to `Gringotts`) and sets its value on his own CreditCase →
   `201 Created` both times.
3. Added a permanent regression test:
   `storage/tests/views_serializers/test_label.py::test_label_value_rejects_using_another_organizations_label`
   — user in org A, label belongs to org B, target object belongs to org A (the exact shape of
   this bug) → asserts `400` and that no `LabelValue` row was created.
4. Full suite: `docker compose exec backend pytest --continue-on-collection-errors -q` →
   **73 passed, 6 skipped** (72 prior + 1 new regression test, no regressions).
5. Confirmed via a schema diff that `schema.yaml`/`api.generated.ts` do not need regenerating —
   the fix only changed serializer validation logic, not any field's shape.

## Note
Left behind in the dev DB from manual verification, not cleaned up (deletion requires explicit
approval): `Label` id=4 (`sucursal`, org=Gringotts, created by goblin) and its `LabelValue`
(`object_id=48`, value=`"MTY Norte"`). The two `Label`/`LabelValue` rows from the user's original
manual testing (admin's `sucursal` label id=2, and its two values `MTY NTE`/`MTY SUR`) were left
untouched throughout.
