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
    ActaConstitutivaPydantic,
    ActasDeAsambleaPydantic,
    BalanceSheetPydantic,
    BankStatementPydantic,
    CashflowStatementPydantic,
    CfdiFacturasPydantic,
    CfdiNominaPydantic,
    ComprobanteDeDomicilioPydantic,
    ConstanciaDeSituacionFiscalPydantic,
    DeclaracionAnualPersonalPydantic,
    DeclaracionAnualPydantic,
    DeclaracionesProvisionalesPydantic,
    IdentificacionOficialPydantic,
    IncomeStatementPydantic,
    OpinionDeCumplimientoPydantic,
    PoderNotarialPydantic,
    PresenceOnlyPydantic,
    ReferenciasComercialesPydantic,
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


class FileTypeGroup:
    """
    How a file type is grouped for a HUMAN reading a list of them.

    Separate from `FileTypeCategory` on purpose. Category is a RECENCY bucket — it decides
    how far back a document may be dated and still count — which is why an acta
    constitutiva (timeless) sits in `OTHER` there. That makes category useless as a
    heading: nobody looking for their articles of incorporation looks under "Other".

    Adding a type therefore means choosing both: where it belongs in a list (here) and how
    fast it goes stale (FileTypeCategory).
    """

    FINANCIAL = 'financial'
    TAX = 'tax'
    LEGAL = 'legal'
    CREDIT = 'credit'
    COLLATERAL = 'collateral'
    OPERATIONAL = 'operational'
    OTHER = 'other'


# The groups in the order a person should meet them, with the heading each one is shown
# under. A tuple, not a dict, because this order IS the display order — the frontend
# renders groups in the order the API reports, and never keeps its own copy of this list
# (a hardcoded copy would go stale the moment a group is added here).
#
# Headings are in Spanish because they are printed directly above the Spanish document
# names (`label_es`) that the UI shows — an English heading over a Spanish list would be
# a language mix inside one list. Unlike the file types themselves there is no second
# English heading stored anywhere; if the app ever grows a language toggle this tuple is
# the one place that has to gain one.
FILE_TYPE_GROUPS: tuple[tuple[str, str], ...] = (
    (FileTypeGroup.FINANCIAL, 'Financieros'),
    (FileTypeGroup.TAX, 'Fiscales / SAT'),
    (FileTypeGroup.LEGAL, 'Legales / corporativos'),
    (FileTypeGroup.CREDIT, 'Proceso de crédito'),
    (FileTypeGroup.COLLATERAL, 'Garantías / aval'),
    (FileTypeGroup.OPERATIONAL, 'Operativos'),
    (FileTypeGroup.OTHER, 'Otros'),
)

FILE_TYPE_GROUP_LABELS: dict[str, str] = dict(FILE_TYPE_GROUPS)

#: Position of each group in the display order above, so the API can hand the frontend a
#: sort key rather than the frontend inventing one.
FILE_TYPE_GROUP_ORDER: dict[str, int] = {
    key: index for index, (key, _) in enumerate(FILE_TYPE_GROUPS)
}


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

    Types with nothing worth extracting (a pagaré, a photo of the premises) share
    `PresenceOnlyPydantic` — the app only needs to know a legible document of that kind
    arrived. Do NOT point those at `UnknownFileDataPydantic`: that means "the classifier
    could not tell what this is", and reusing it would destroy that failure signal.
    """

    months_required: int | None = None
    """
    How many distinct months this document must cover to satisfy its requirement
    (e.g. 12 monthly bank statements). `None` means a single document is enough,
    regardless of period.

    NOT CURRENTLY ENFORCED for credit cases. `CreditCase.missing_file_type_names`
    compares sets of file type keys, so one uploaded bank statement satisfies a
    `months_required=12` requirement today. The values here are still recorded honestly
    so they are right when enforcement lands — see the open decisions in
    `docs/architecture/file_type_catalog_reference.md`.
    """

    group: str = FileTypeGroup.OTHER
    """
    Which heading this type is listed under when a user picks documents (see
    `FileTypeGroup`). Display only — it never affects whether a document satisfies a
    requirement.
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
    # NOTE: the section comments below group types the way a person reads them. They are
    # NOT the `category` field, which is a RECENCY bucket (see FileTypeCategory) — that is
    # why timeless documents like an acta constitutiva sit in OTHER rather than LEGAL.

    # FINANCIALS
    FileTypeSpec(
        key='balance_sheet',
        label_en='Balance sheet',
        label_es='Balance general',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.FINANCIAL,
        pydantic_model=BalanceSheetPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='bank_statement',
        label_en='Bank statement',
        label_es='Estado de cuenta bancario',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.FINANCIAL,
        pydantic_model=BankStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='cashflow_statement',
        label_en='Cashflow statement',
        label_es='Estado de flujo de efectivo',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.FINANCIAL,
        pydantic_model=CashflowStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='income_statement',
        label_en='Income statement',
        label_es='Estado de resultados',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.FINANCIAL,
        pydantic_model=IncomeStatementPydantic,
        months_required=12,
        is_default_suggestion=True,
    ),

    # TAX / SAT
    FileTypeSpec(
        key='constancia_de_situacion_fiscal',
        label_en='Constancia de situación fiscal',
        label_es='Constancia de situación fiscal',
        category=FileTypeCategory.LEGAL,
        group=FileTypeGroup.TAX,
        pydantic_model=ConstanciaDeSituacionFiscalPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='opinion_de_cumplimiento',
        label_en='Certificate of tax compliance',
        label_es='Opinión de cumplimiento (32-D)',
        category=FileTypeCategory.LEGAL,
        group=FileTypeGroup.TAX,
        pydantic_model=OpinionDeCumplimientoPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='declaracion_anual',
        label_en='Annual tax return',
        label_es='Declaración anual',
        # OTHER, not LEGAL: an annual return is by definition older than the 3-month
        # recency limit, so any tighter bucket would reject every valid one.
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.TAX,
        pydantic_model=DeclaracionAnualPydantic,
        months_required=1,
    ),
    FileTypeSpec(
        key='declaraciones_provisionales',
        label_en='Provisional IVA/ISR filings',
        label_es='Declaraciones provisionales IVA/ISR',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.TAX,
        pydantic_model=DeclaracionesProvisionalesPydantic,
        months_required=12,
    ),
    FileTypeSpec(
        key='cfdi_facturas',
        label_en='CFDI invoices',
        label_es='CFDI de ingresos (facturas)',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.TAX,
        pydantic_model=CfdiFacturasPydantic,
        months_required=12,
    ),
    FileTypeSpec(
        key='cfdi_nomina',
        label_en='Payroll CFDIs',
        label_es='CFDI de nómina',
        category=FileTypeCategory.FINANCIAL,
        group=FileTypeGroup.TAX,
        pydantic_model=CfdiNominaPydantic,
        months_required=12,
    ),
    FileTypeSpec(
        key='declaracion_anual_personal',
        label_en='Personal annual tax return',
        label_es='Declaración anual persona física',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.TAX,
        pydantic_model=DeclaracionAnualPersonalPydantic,
        months_required=1,
    ),
    FileTypeSpec(
        key='constancia_no_adeudo_imss',
        label_en='IMSS certificate of no debt',
        label_es='Constancia de no adeudo IMSS',
        category=FileTypeCategory.LEGAL,
        group=FileTypeGroup.TAX,
        pydantic_model=PresenceOnlyPydantic,
        months_required=1,
    ),
    FileTypeSpec(
        key='alta_imss',
        label_en='IMSS employer registration',
        label_es='Alta patronal IMSS',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.TAX,
        pydantic_model=PresenceOnlyPydantic,
    ),

    # LEGAL / CORPORATE
    FileTypeSpec(
        key='acta_constitutiva',
        label_en='Articles of incorporation',
        label_es='Acta constitutiva',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.LEGAL,
        pydantic_model=ActaConstitutivaPydantic,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='actas_de_asamblea',
        label_en='Shareholder meeting minutes',
        label_es='Actas de asamblea / modificaciones',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.LEGAL,
        pydantic_model=ActasDeAsambleaPydantic,
    ),
    FileTypeSpec(
        key='poder_notarial',
        label_en='Power of attorney',
        label_es='Poder notarial de apoderados',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.LEGAL,
        pydantic_model=PoderNotarialPydantic,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='identificacion_oficial',
        label_en='Official photo ID',
        label_es='Identificación oficial',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.LEGAL,
        pydantic_model=IdentificacionOficialPydantic,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='curp',
        label_en='CURP',
        label_es='CURP',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.LEGAL,
        pydantic_model=PresenceOnlyPydantic,
    ),
    FileTypeSpec(
        key='comprobante_de_domicilio',
        label_en='Proof of address',
        label_es='Comprobante de domicilio',
        category=FileTypeCategory.LEGAL,
        group=FileTypeGroup.LEGAL,
        pydantic_model=ComprobanteDeDomicilioPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),

    # CREDIT
    FileTypeSpec(
        key='referencias_comerciales',
        label_en='Trade references',
        label_es='Referencias comerciales',
        category=FileTypeCategory.LEGAL,
        group=FileTypeGroup.CREDIT,
        pydantic_model=ReferenciasComercialesPydantic,
        months_required=1,
        is_default_suggestion=True,
    ),
    FileTypeSpec(
        key='pagare',
        label_en='Promissory note',
        label_es='Pagaré',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.CREDIT,
        pydantic_model=PresenceOnlyPydantic,
    ),

    # OPERATIONAL
    FileTypeSpec(
        key='fotografias_establecimiento',
        label_en='Photos of the premises',
        label_es='Fotografías del establecimiento',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.OPERATIONAL,
        pydantic_model=PresenceOnlyPydantic,
    ),

    # EXTRA
    FileTypeSpec(
        key='unknown',
        label_en='Unknown',
        label_es='Desconocido',
        category=FileTypeCategory.OTHER,
        group=FileTypeGroup.OTHER,
        pydantic_model=UnknownFileDataPydantic,
        is_requirable=False,
    ),
)
