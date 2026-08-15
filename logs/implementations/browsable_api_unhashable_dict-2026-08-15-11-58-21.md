# Fix — browsable API 500s: "TypeError: unhashable type: 'dict'"

Date: 2026-08-15

## Symptom

Most endpoints in the DRF browsable API returned 500, including `/api/v1/credit-cases/` and
`/api/v1/customer-contacts/`. JSON responses were fine throughout, so the frontend was unaffected —
only the HTML UI was broken.

## Cause

`core/serializer_utils.py`'s `NamedHyperlinkedRelatedField` represents a relation as a dict:

```python
{"url": "http://.../customers/5/", "display": "Acme Corp"}
```

DRF's `RelatedField.get_choices()` builds the `<select>` options for the browsable API's HTML forms
like this:

```python
return OrderedDict([
    (self.to_representation(item), self.display_value(item))
    for item in queryset
])
```

It uses the representation as a **dict key**. A dict is unhashable, so rendering any form containing
one of these fields raised `TypeError: unhashable type: 'dict'`. Since
`NamedHyperlinkedModelSerializer` sets `serializer_related_field = NamedHyperlinkedRelatedField`,
that is every serializer in the app with a writable relation.

JSON never hit it because JSON rendering doesn't build forms — only
`BrowsableAPIRenderer.get_rendered_html_form()` calls `get_choices()`.

## Fix

`backend/core/serializer_utils.py` — added a `get_choices()` override keyed by the plain URL:

- Extracted `_to_url(value)` (the parent's representation) so `to_representation` and `get_choices`
  share one definition of "the hyperlink".
- `get_choices()` returns `OrderedDict((self._to_url(item), self.display_value(item)) ...)`.

Keyed by URL deliberately: an option's key is the value the HTML form submits back, and
`to_internal_value` is inherited unchanged, so a plain URL string is exactly what the field expects
to receive. The dict read representation — the whole point of the field — is untouched.

## Verification

- Scripted probe through the real render path (real settings, real DB, `Accept: text/html`) across
  every endpoint in the API root: **all 12 list routes and 11 detail routes return 200**, where the
  reported ones were 500 before.
- Causation shown directly rather than inferred: calling DRF's stock
  `relations.RelatedField.get_choices(field)` on the very same live field still raises
  `TypeError: unhashable type: 'dict'`, while `field.get_choices()` returns 22 usable options.
- Backend suite **174 passed, 6 skipped** (was 160).

## Regression tests

`backend/core/tests/test_browsable_api.py`:
- Parametrized render of all 11 list routes as `text/html`, with rows present so the dropdowns
  actually have choices to key (an empty queryset would have rendered fine even with the bug).
- The defect pinned at field level: DRF's own implementation is invoked directly and asserted to
  still raise, so the test proves the override is what fixes it rather than some incidental change.
- Choice keys round-trip: a key the form offers is accepted back by `to_internal_value`.
- The JSON `{url, display}` representation is asserted unchanged.

## Incident during this work

While trying to capture "before" evidence, I ran `git checkout backend/core/serializer_utils.py`.
That file's entire `Named*` machinery was **uncommitted**, so the checkout discarded it. I had copied
the file to the scratchpad seconds earlier and restored it immediately and completely — verified by
reading the file back in full and re-running the suite (174 passed).

Nothing was lost, but the near-miss is worth recording: large amounts of this repo's work are
uncommitted, so `git checkout <file>` is destructive here. The "before" evidence was obtained
afterwards without touching the working tree, by calling the stock DRF implementation directly.
