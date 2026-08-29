"""
Guards on the file type catalog itself.

The catalog is plain data, so it has no behaviour of its own to test — but it is now long
enough that a typo in one row is a live risk, and the ways it can be wrong are all silent.
A bad `category` falls back to "no recency limit", a duplicate `key` quietly shadows an
earlier row, and a pydantic model that OpenAI's structured outputs will not accept only
fails at a real API call, in a Celery worker, after money has been spent.

None of these tests touch the database.
"""

import re

from core.file_type_catalog import (
    FILE_TYPE_CATALOG,
    FILE_TYPE_GROUP_LABELS,
    FILE_TYPE_GROUP_ORDER,
    FILE_TYPE_GROUPS,
    FileTypeCategory,
    FileTypeGroup,
)
from core.file_type_spec import (
    DEFAULT_SUGGESTION_KEYS,
    FILE_TYPE_KEYS,
    MAX_MONTHS_BACK_BY_CATEGORY,
    PYDANTIC_BY_KEY,
    REQUIRABLE_KEYS,
    SPEC_BY_KEY,
)
from integrations.openai.services.pydantic_models.file_type_models import (
    PresenceOnlyPydantic,
    UnknownFileDataPydantic,
)


KEY_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')


def test_every_key_is_unique():
    """
    A duplicate key would silently win in SPEC_BY_KEY and lose its own extraction schema,
    since the dict is built by overwriting.
    """
    keys = [spec.key for spec in FILE_TYPE_CATALOG]

    assert len(keys) == len(set(keys)), f'duplicate keys: {sorted(k for k in keys if keys.count(k) > 1)}'
    assert len(SPEC_BY_KEY) == len(FILE_TYPE_CATALOG)


def test_keys_are_lower_snake_case():
    """
    `key` is stored in every UploadDocument.file_type_name and is immutable once shipped,
    so a stray capital or hyphen is permanent.
    """
    bad = [spec.key for spec in FILE_TYPE_CATALOG if not KEY_PATTERN.match(spec.key)]

    assert bad == [], f'keys must be lower_snake_case: {bad}'


def test_every_spec_has_labels_in_both_languages():
    """The app's users are Mexican companies, so a missing label_es shows up in the UI."""
    missing = [
        spec.key for spec in FILE_TYPE_CATALOG
        if not spec.label_en.strip() or not spec.label_es.strip()
    ]

    assert missing == []


def test_every_category_has_a_recency_rule():
    """
    `category` is a recency bucket, and `max_months_back()` reads it from a dict with
    `.get()` — so an invented category silently means "no recency limit at all" rather
    than raising.
    """
    for spec in FILE_TYPE_CATALOG:
        assert spec.category in {
            FileTypeCategory.FINANCIAL,
            FileTypeCategory.LEGAL,
            FileTypeCategory.OTHER,
        }, f'{spec.key} has unknown category {spec.category!r}'
        assert spec.category in MAX_MONTHS_BACK_BY_CATEGORY, (
            f'{spec.key} category {spec.category!r} has no entry in '
            f'MAX_MONTHS_BACK_BY_CATEGORY'
        )


def test_unknown_is_the_only_non_requirable_type():
    """
    'unknown' is the classifier's fallback bucket, not a document anyone can hand over, so
    it must never be something a credit case can require. Everything else must be.
    """
    assert 'unknown' in FILE_TYPE_KEYS
    assert 'unknown' not in REQUIRABLE_KEYS
    assert set(FILE_TYPE_KEYS) - set(REQUIRABLE_KEYS) == {'unknown'}


def test_default_suggestions_are_all_requirable():
    """
    Default suggestions pre-tick an organization's first requirement template. Suggesting
    a type that cannot be required would produce a template nothing can satisfy.
    """
    assert set(DEFAULT_SUGGESTION_KEYS) <= set(REQUIRABLE_KEYS)
    assert DEFAULT_SUGGESTION_KEYS, 'a new organization needs something pre-ticked'


def test_only_unknown_uses_the_unknown_extraction_model():
    """
    `UnknownFileDataPydantic` means "the classifier could not tell what this is". Using it
    as a stand-in for a document with nothing to extract would make a perfectly good
    pagaré indistinguishable from a failed classification — that is what
    `PresenceOnlyPydantic` is for.
    """
    misuse = [
        spec.key for spec in FILE_TYPE_CATALOG
        if spec.pydantic_model is UnknownFileDataPydantic and spec.key != 'unknown'
    ]

    assert misuse == [], f'these should use PresenceOnlyPydantic instead: {misuse}'


def test_presence_only_types_extract_nothing_else():
    """
    Presence-only types deliberately share one model. This pins that they really do share
    it rather than each drifting into a near-copy.
    """
    presence_only = [
        spec.key for spec in FILE_TYPE_CATALOG
        if spec.pydantic_model is PresenceOnlyPydantic
    ]

    assert presence_only, 'expected at least one presence-only type in the catalog'
    for key in presence_only:
        assert set(PYDANTIC_BY_KEY[key].model_fields) == {
            'document_date', 'is_legible', 'summary',
        }


def test_every_extraction_model_is_valid_for_openai_structured_outputs():
    """
    OpenAI's structured outputs reject a schema unless EVERY property is listed in
    `required` and `additionalProperties` is false. A field declared optional the normal
    pydantic way (`x: int = None`) drops out of `required` and the API refuses the whole
    request — at classification time, inside a worker. Optional values must instead be
    `Optional[X] = Field(...)`, which stays required but nullable.

    Checked recursively because nested models ($defs), like the entries inside
    referencias_comerciales, must satisfy the same rules.
    """
    def check(schema, name):
        if schema.get('type') == 'object' or 'properties' in schema:
            properties = set(schema.get('properties', {}))
            required = set(schema.get('required', []))
            assert properties == required, (
                f'{name}: every property must be required for OpenAI structured '
                f'outputs; missing from required: {sorted(properties - required)}'
            )
            assert schema.get('additionalProperties') is False, (
                f'{name}: additionalProperties must be false'
            )

    for key, model in PYDANTIC_BY_KEY.items():
        schema = model.model_json_schema()
        check(schema, key)
        for def_name, def_schema in schema.get('$defs', {}).items():
            check(def_schema, f'{key} -> {def_name}')


def test_every_group_is_one_the_app_can_label():
    """
    A typo'd group is invisible until a user opens the picker and finds a heading named
    "financail" — or nothing at all under the real one.
    """
    known = set(FILE_TYPE_GROUP_LABELS)
    bad = {spec.key: spec.group for spec in FILE_TYPE_CATALOG if spec.group not in known}

    assert not bad, f'file types in an unknown group: {bad}'


def test_every_declared_group_has_a_label_and_a_position():
    """Both maps are derived from FILE_TYPE_GROUPS, so this pins that they stay in step."""
    declared = [key for key, _ in FILE_TYPE_GROUPS]

    assert list(FILE_TYPE_GROUP_LABELS) == declared
    assert sorted(FILE_TYPE_GROUP_ORDER, key=FILE_TYPE_GROUP_ORDER.get) == declared


def test_no_requirable_type_falls_back_to_other():
    """
    `group` has a default, so forgetting it on a new catalog row is silent — the document
    just quietly turns up under "Other" instead of with its peers. Only `unknown`, which
    is not a document anyone can hand over, belongs there.
    """
    stragglers = [
        spec.key
        for spec in FILE_TYPE_CATALOG
        if spec.is_requirable and spec.group == FileTypeGroup.OTHER
    ]

    assert not stragglers, f'file types missing a group=: {stragglers}'


def test_every_group_with_members_is_worth_showing():
    """
    An empty group is fine (Collateral / aval is declared ahead of the types that will
    fill it), but every type must land in a group that a person would look under.
    """
    grouped = {spec.group for spec in FILE_TYPE_CATALOG if spec.is_requirable}

    assert grouped, 'no requirable types are grouped at all'
    assert grouped <= set(FILE_TYPE_GROUP_LABELS)
