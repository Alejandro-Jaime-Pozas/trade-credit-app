# Plan: hyperlinked relation fields show a name, not just a URL

## Problem

Every DRF `HyperlinkedRelatedField` in this API (e.g. `CreditCase.customer`,
`UploadDocument.credit_case`, `Customer.organization`) serializes to a bare URL string
like `http://.../customers/5/`. A human (or the frontend) can't tell which object that is
without following the link first.

## Approach

Add one shared field class instead of hand-rolling a fix per serializer:

1. **`core/serializer_utils.py`** — `NamedHyperlinkedRelatedField(HyperlinkedRelatedField)`:
   - `to_representation` wraps the normal URL in `{"url": ..., "display": ...}`.
   - `display` defaults to `str(related_object)` (every model already has a `__str__`);
     an optional `display_source='name'` kwarg (dotted-path capable) overrides it per field
     where the model's `__str__` isn't a good display string (e.g. `Organization.__str__`
     returns its email domain, not its `name`).
   - `to_internal_value` is left untouched (inherited) — writes still take a plain URL
     string, only reads change.
   - Must override `use_pk_only_optimization()` to return `False`: DRF's
     `HyperlinkedRelatedField` normally opts INTO a pk-only fetch when `lookup_field == 'pk'`,
     which would hand `to_representation` a `PKOnlyObject` with no other attributes —
     breaking both `str(value)` and `display_source`.
   - `NamedHyperlinkedModelSerializer(HyperlinkedModelSerializer)` — sets
     `serializer_related_field = NamedHyperlinkedRelatedField` so every AUTO-BUILT relation
     field (not explicitly declared on the serializer) picks this up for free. The
     serializer's own identity `url` field is built separately by DRF and is untouched by
     this, which satisfies the "self url stays a plain string" scope decision automatically.
   - `OpenApiSerializerFieldExtension` subclass so drf-spectacular (which generates
     `backend/schema.yaml`, which drives the frontend's generated TS types) documents the
     new `{url, display}` shape instead of guessing `string`.

2. Every `HyperlinkedModelSerializer` subclass in `customers/`, `identity/`, `processing/`,
   `storage/` switches its base class to `NamedHyperlinkedModelSerializer`, and every
   explicit `serializers.HyperlinkedRelatedField(...)` field declaration switches to
   `NamedHyperlinkedRelatedField(...)`. `display_source='name'` added specifically for
   Organization-, AccountApplication-, and Label-typed relations (their `__str__` isn't a
   good display string).

3. Regenerate `backend/schema.yaml` (`manage.py spectacular`) and
   `frontend/src/lib/api.generated.ts` (`npm run api:generate`) so the contract sync stays
   accurate (per `docs/architecture/architecture.md`'s "Contract sync" rule).

4. Fix every frontend read-site that treated a relation field as a bare URL string
   (comparisons, object-lookup keys, values re-sent in a write payload) to use `.url`
   instead. Writes that already sent a plain URL string (e.g. `customer: linkedCustomer.url`
   where `linkedCustomer` is a fully-fetched `Customer`, not a relation field) are
   unaffected — only reads of a *relation field's own value* change shape.

5. Update backend/frontend test fixtures that construct fake relation values as bare
   strings.

## Files expected to change

- `backend/core/serializer_utils.py` (new field/serializer/schema-extension classes)
- `backend/customers/serializers.py`, `backend/identity/serializers.py`,
  `backend/processing/serializers.py`, `backend/storage/serializers.py`
- `backend/schema.yaml`, `frontend/src/lib/api.generated.ts` (regenerated)
- `frontend/src/app/customers/[id]/page.tsx`, `frontend/src/app/customers/new/page.tsx`,
  `frontend/src/app/credit-cases/page.tsx`, `frontend/src/app/credit-cases/new/page.tsx`,
  `frontend/src/app/credit-cases/[id]/page.tsx`, `frontend/src/lib/creditCase.ts`,
  `frontend/src/lib/fileTypes.ts`
- `frontend/src/lib/creditCase.test.ts`, `frontend/src/app/credit-cases/page.test.tsx`
  (fixture updates)

## Verification

- `make pytest` (backend), `make typecheck` + `make lint` + `make vitest` (frontend) all
  green before calling this done.
