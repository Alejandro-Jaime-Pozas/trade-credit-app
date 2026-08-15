from collections import OrderedDict

from rest_framework import serializers
from drf_spectacular.extensions import OpenApiSerializerFieldExtension
from drf_spectacular.plumbing import build_basic_type
from drf_spectacular.types import OpenApiTypes


def pass_into_serializer_check(serializer, obj, res):
    """
    Pass in a serializer, check if hyperlink serializer
    and account for request context if so.
    """
    return serializer(obj, context={'request': res.wsgi_request})  # may need to add logic for non-hyperlink serializer requests?


class NamedHyperlinkedRelatedField(serializers.HyperlinkedRelatedField):
    """
    A hyperlink field for relations (e.g. a CreditCase's `customer`) that renders as
    `{"url": "...", "display": "Acme Corp"}` instead of a bare URL string.

    WHY: a plain hyperlinked URL like `http://.../customers/5/` tells a human nothing
    about WHICH customer it points to without following the link first. `display` gives
    them a readable name to show (e.g. in a table or a link's text) while `url` is still
    there to actually navigate to that object.

    Only READS change. `to_internal_value` (used when a client POSTs/PATCHes a value for
    this field) is inherited unchanged from `HyperlinkedRelatedField`, so creating/updating
    a relation still works by sending a plain URL string, exactly as before.
    """

    def __init__(self, *args, display_source=None, **kwargs):
        # Which attribute on the related object to show as `display`. Supports dotted
        # paths (e.g. 'file_type.key'), same idea as DRF's own `source=`. Left as None,
        # this falls back to `str(related_object)` — every Django model already defines
        # a `__str__`, so this is a sane default without extra configuration.
        self.display_source = display_source
        super().__init__(*args, **kwargs)

    def use_pk_only_optimization(self):
        # HyperlinkedRelatedField normally opts INTO this optimization (when
        # lookup_field == 'pk'): DRF then only fetches the related object's pk, wrapping
        # it in a bare PKOnlyObject that has no other attributes. That's fine for just
        # building a URL, but `display` needs the real object (its __str__ or
        # `display_source` attribute), so this field always needs the full instance.
        return False

    def _get_display(self, value):
        if self.display_source is None:
            return str(value)
        obj = value
        for part in self.display_source.split('.'):
            obj = getattr(obj, part)
        return str(obj)

    def _to_url(self, value):
        """The plain hyperlink string, i.e. what the parent class would have returned."""
        return super().to_representation(value)

    def to_representation(self, value):
        return {
            'url': self._to_url(value),
            'display': self._get_display(value),
        }

    def get_choices(self, cutoff=None):
        """
        The <select> options for this relation in the browsable API's HTML forms.

        DRF's own implementation keys this mapping by `to_representation(item)`. That
        works for a normal hyperlinked field, whose representation is a URL string, but
        ours is a dict — and a dict can't be a dict key, so rendering ANY form containing
        one of these fields died with "TypeError: unhashable type: 'dict'". That took out
        the browsable API for most endpoints (credit cases, customer contacts, and every
        other serializer with a writable relation), while JSON responses were unaffected
        because they never build a form.

        Keyed by the URL on purpose: an option's key is the value the form submits back,
        and `to_internal_value` is inherited unchanged, so a plain URL string is exactly
        what this field expects to receive.
        """
        queryset = self.get_queryset()
        if queryset is None:
            return {}

        if cutoff is not None:
            queryset = queryset[:cutoff]

        return OrderedDict(
            (self._to_url(item), self.display_value(item)) for item in queryset
        )


class NamedHyperlinkedModelSerializer(serializers.HyperlinkedModelSerializer):
    """
    Identical to DRF's `HyperlinkedModelSerializer`, except every relation field it
    auto-builds (a ForeignKey/ManyToMany to another model) uses `NamedHyperlinkedRelatedField`
    above instead of the plain `HyperlinkedRelatedField`. Every serializer in this app that
    links to OTHER objects should subclass this instead of `serializers.HyperlinkedModelSerializer`.

    Only relation fields are affected — a resource's OWN identity `url` field (e.g. a
    CreditCase's own `url`) is built separately by DRF (`serializer_url_field`) and is
    untouched by this, by design: that field is how the browsable API/frontend already
    identifies "this specific record", not a link to something else.
    """

    serializer_related_field = NamedHyperlinkedRelatedField


class NamedHyperlinkedRelatedFieldExtension(OpenApiSerializerFieldExtension):
    """
    Teaches drf-spectacular (the package that generates `backend/schema.yaml`, which in
    turn drives the frontend's generated TypeScript types — see
    `docs/architecture/architecture.md`'s "Contract sync") what `NamedHyperlinkedRelatedField`
    actually returns. Without this, spectacular would still document these fields as plain
    `string` (its default guess for a HyperlinkedRelatedField), and the generated frontend
    types would be wrong.
    """

    target_class = 'core.serializer_utils.NamedHyperlinkedRelatedField'

    def map_serializer_field(self, auto_schema, direction):
        return {
            'type': 'object',
            'properties': {
                'url': build_basic_type(OpenApiTypes.URI),
                'display': build_basic_type(OpenApiTypes.STR),
            },
            'required': ['url', 'display'],
        }
