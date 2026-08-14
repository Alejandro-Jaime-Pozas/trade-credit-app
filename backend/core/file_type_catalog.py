"""
The single source of truth for every document type the app knows about.

**To add a new file type, add one `FileTypeSpec` to `FILE_TYPE_CATALOG` below and run
`manage.py sync_file_types`** — nothing else.

This file is deliberately kept to just the catalog and its shape, because the list is
expected to grow long. Everything derived from it (lookups by key, the pydantic mapping,
month/recency helpers) lives in `core/file_type_spec.py`, which imports this one.

Background: a "file type" (e.g. `bank_statement`) shows up in a lot of places — it is
the value stored in `UploadDocument.file_type_name`, the list of labels GPT is allowed
to classify a document as, the extraction schema GPT uses to pull data out of that
document, and the set of documents a credit case can require. Those used to be four
separate Python constants that had to be kept in sync by hand, so adding one file type
meant editing five files and forgetting one was easy.

Note the catalog is a plain Python tuple (app-owned, version-controlled), while the
`storage.FileType` table is its database mirror. The table exists because requirement
templates need real foreign keys to point at, and because organizations will eventually
be able to add their own file types alongside these (see `docs/versions/v2.md`). The
sync command copies this tuple into that table; it never does the reverse.
"""

from dataclasses import dataclass

from integrations.openai.services.pydantic_models.file_type_models import (
    BalanceSheetPydantic,
    BankStatementPydantic,
    CashflowStatementPydantic,
    ConstanciaDeSituacionFiscalPydantic,
    IncomeStatementPydantic,
    UnknownFileDataPydantic,
)


class FileTypeCategory:
    """
    Broad grouping for a file type. Category decides how far back a document may be
    dated and still count toward a requirement (see `MAX_MONTHS_BACK_BY_CATEGORY` in
    core/file_type_spec.py) — a bank statement goes stale much faster than a constancia.
    """

    FINANCIAL = 'financial'
    LEGAL = 'legal'
    OTHER = 'other'


@dataclass(frozen=True)
class FileTypeSpec:
    """One row of the catalog: everything the app knows about a single file type."""

    key: str
    """
    Stable identifier, stored in `UploadDocument.file_type_name` and used to match an
    uploaded document against a requirement.

    IMMUTABLE once shipped. Renaming a key would orphan every document already stored
    under the old value; rename `label_en`/`label_es` instead — those are display-only.
    """

    label_en: str
    """Human-readable English name, e.g. "Bank statement"."""

    label_es: str
    """Human-readable Spanish name — the app's users are Mexican companies."""

    category: str
    """One of the `FileTypeCategory` values."""

    pydantic_model: type
    """
    The pydantic model describing what data GPT should extract from this kind of
    document. Only ever used to generate a JSON schema for the OpenAI request
    (see `GPTService.get_pydantic_model_json_schema`).
    """

    months_required: int | None = None
    """
    How many distinct months this document must cover to satisfy its requirement
    (e.g. 12 monthly bank statements). `None` means a single document is enough,
    regardless of period.
    """

    is_default_suggestion: bool = False
    """
    Whether this type is pre-ticked when an organization first builds its requirement
    template. These are only starting suggestions — the organization is free to remove
    any of them and add any other catalog type.
    """

    is_requirable: bool = True
    """
    Whether a credit case can require this type at all. `False` for `unknown`, which is
    the classifier's fallback bucket rather than a real document a user could hand over.
    Non-requirable types are never written to the `storage.FileType` table.
    """


# The catalog itself. Deliberately an ordered tuple rather than a set: a set's iteration
# order changes between processes (it depends on Python's per-run hash seed), which used
# to make `makemigrations` propose a phantom AlterField on `file_type_name` almost every
# run, since the field's `choices` were generated from it.
FILE_TYPE_CATALOG: tuple[FileTypeSpec, ...] = (
    # FINANCIALS
    FileTypeSpec(
        key='balance_sheet',
        label_en='Balance sheet',
        label_es='Balance general',
        category=FileTypeCategory.FINANCIAL,
        pydantic_model=BalanceSheetPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='bank_statement',
        label_en='Bank statement',
        label_es='Estado de cuenta bancario',
        category=FileTypeCategory.FINANCIAL,
        pydantic_model=BankStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='cashflow_statement',
        label_en='Cashflow statement',
        label_es='Estado de flujo de efectivo',
        category=FileTypeCategory.FINANCIAL,
        pydantic_model=CashflowStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='income_statement',
        label_en='Income statement',
        label_es='Estado de resultados',
        category=FileTypeCategory.FINANCIAL,
        pydantic_model=IncomeStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),
    # LEGAL
    FileTypeSpec(
        key='constancia_de_situacion_fiscal',
        label_en='Constancia de situación fiscal',
        label_es='Constancia de situación fiscal',
        category=FileTypeCategory.LEGAL,
        pydantic_model=ConstanciaDeSituacionFiscalPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    # EXTRA
    FileTypeSpec(
        key='unknown',
        label_en='Unknown',
        label_es='Desconocido',
        category=FileTypeCategory.OTHER,
        pydantic_model=UnknownFileDataPydantic,
        is_requirable=False,
    ),
)
