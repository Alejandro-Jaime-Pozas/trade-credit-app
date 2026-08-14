"""
Everything derived from the file type catalog.

`core/file_type_catalog.py` holds only the raw list (and its shape) so it can grow long
without becoming hard to read. This module is the one application code should import
from: it turns that list into the lookups and helpers the rest of the app needs.

The import goes one way — this module reads the catalog, never the reverse.
"""

from .file_type_catalog import FILE_TYPE_CATALOG, FileTypeCategory, FileTypeSpec


# How stale a document of a given category may be and still count toward a requirement,
# in months back from today. `None` means no recency limit.
MAX_MONTHS_BACK_BY_CATEGORY: dict[str, int | None] = {
    FileTypeCategory.FINANCIAL: 2,
    FileTypeCategory.LEGAL: 3,
    FileTypeCategory.OTHER: None,
}


# ---------------------------------------------------------------------------
# Derived lookups. Built once at import instead of scanning the catalog on every
# call — the catalog never changes at runtime.
# ---------------------------------------------------------------------------

SPEC_BY_KEY: dict[str, FileTypeSpec] = {spec.key: spec for spec in FILE_TYPE_CATALOG}

# Every valid `UploadDocument.file_type_name` value, including 'unknown'. This is what
# GPT is allowed to classify a document as.
FILE_TYPE_KEYS: tuple[str, ...] = tuple(SPEC_BY_KEY)

# Types a credit case may actually require ('unknown' excluded).
REQUIRABLE_KEYS: tuple[str, ...] = tuple(
    spec.key for spec in FILE_TYPE_CATALOG if spec.is_requirable
)

# Types pre-ticked when an organization first builds its requirement template.
DEFAULT_SUGGESTION_KEYS: tuple[str, ...] = tuple(
    spec.key for spec in FILE_TYPE_CATALOG if spec.is_default_suggestion
)

# file_type_name -> the pydantic model GPT extracts that file's data with.
PYDANTIC_BY_KEY: dict[str, type] = {
    spec.key: spec.pydantic_model for spec in FILE_TYPE_CATALOG
}


def get_spec(key: str) -> FileTypeSpec | None:
    """Look up one catalog entry by its key, or None if the key isn't in the catalog."""
    return SPEC_BY_KEY.get(key)


def months_required_by_category(category: str) -> dict[str, int]:
    """
    Map of file_type_name -> months required, for the given category only.

    Used by the month-coverage checks in `processing/services/credit_case.py`, which
    treat financial and legal documents differently.
    """
    return {
        spec.key: spec.months_required
        for spec in FILE_TYPE_CATALOG
        if spec.category == category and spec.months_required
    }


def max_months_back(category: str) -> int | None:
    """How far back a document in this category may be dated and still count."""
    return MAX_MONTHS_BACK_BY_CATEGORY.get(category)
