# Implementation: hyperlinked relation fields show a name, not just a URL

## What changed

### `backend/core/serializer_utils.py`

- `NamedHyperlinkedRelatedField` — a `HyperlinkedRelatedField` subclass whose
  `to_representation` returns `{"url": "...", "display": "..."}` instead of a bare URL
  string. `display` defaults to `str(related_object)`; an optional `display_source=`
  kwarg (dotted-path capable, e.g. `'file_type.key'`) overrides it. Writes are
  unaffected — `to_internal_value` is inherited unchanged, so a client still sends a
  plain URL string to create/update a relation.
  - Overrides `use_pk_only_optimization()` to return `False`. Found via a real test
    failure: `HyperlinkedRelatedField` normally opts INTO a pk-only fetch when
    `lookup_field == 'pk'` (the default), which hands `to_representation` a
    `PKOnlyObject` that only has `.pk` — no `__str__`, no other attributes. Without
    this override, every request would crash with
    `AttributeError: 'PKOnlyObject' object has no attribute '...'`.
- `NamedHyperlinkedModelSerializer` — `HyperlinkedModelSerializer` subclass with
  `serializer_related_field = NamedHyperlinkedRelatedField`, so every relation field DRF
  auto-builds from `Meta.fields` picks up the new shape without being redeclared. A
  resource's own identity `url` field is built via a separate DRF mechanism
  (`serializer_url_field`) and is untouched — matches the "only relation fields, not
  self url" scope decision automatically, with no special-casing needed.
- `NamedHyperlinkedRelatedFieldExtension` — a drf-spectacular
  `OpenApiSerializerFieldExtension` so `backend/schema.yaml` documents the new
  `{url, display}` object shape instead of guessing `string`.

### Serializers (`customers/`, `identity/`, `processing/`, `storage/`)

Every `HyperlinkedModelSerializer` subclass now extends `NamedHyperlinkedModelSerializer`;
every explicit `serializers.HyperlinkedRelatedField(...)` now uses
`NamedHyperlinkedRelatedField(...)`. `display_source='name'` added on relations that
point at `Organization` (its `__str__` returns the email domain, not its name) and
`AccountApplication` (its `__str__` is a debug repr), and on `LabelValueSerializer.label`
(`Label.__str__` is `"name=X, content_type=Y"` — just the name reads far better).

Plain `ModelSerializer` subclasses (`RequirementTemplateItemSerializer`, the
`Simple*Serializer` nested read-only serializers) were left untouched — they render full
nested objects, not links to elsewhere, so they were out of scope.

### Contract sync

Ran `manage.py spectacular --file schema.yaml --validate` and `npm run api:generate` to
regenerate `backend/schema.yaml` and `frontend/src/lib/api.generated.ts` per
`docs/architecture/architecture.md`'s "Contract sync" rule. Spot-checked the generated
schema/types show `{url: string, display: string}` for e.g. `CreditCase.customer`.

### Frontend

Every read-site that treated a relation field as a bare URL string was switched to read
`.url` (filtering/keying/comparisons) or `.url` when re-sent in a write payload:
`app/customers/[id]/page.tsx`, `app/customers/new/page.tsx`, `app/credit-cases/page.tsx`,
`app/credit-cases/new/page.tsx`, `app/credit-cases/[id]/page.tsx`, `lib/creditCase.ts`,
`lib/fileTypes.ts`. Display text (e.g. the customer name shown in the credit cases table)
still comes from a separately-fetched full object, not the new `display` field, so visible
UI text is unchanged — this was a deliberate minimal-diff choice, not an oversight;
`display` is available for pages that want a name without a separate fetch, but no
existing page needed that yet.

Writes that already sent a plain URL string from a fully-fetched object's own `.url`
(e.g. `customer: linkedCustomer.url`) were NOT touched — only reads of a relation
field's *own* value changed shape.

### Tests

- Backend: no test assertions needed updating — none asserted the string shape of a
  relation field directly (`make pytest`: 148 passed, 6 skipped).
- Frontend: `lib/creditCase.test.ts` and `app/credit-cases/page.test.tsx` fixtures built
  fake `CreditCase.customer` values as bare strings; added a small `customerRef(url)`
  helper in each file and updated all fixture sites (`make vitest`: 121 passed).

## Verification

- `make pytest` — 148 passed, 6 skipped.
- `make typecheck` — clean.
- `make lint` — clean.
- `make vitest` — 121 passed.
