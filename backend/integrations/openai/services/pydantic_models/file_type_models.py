from datetime import date
from typing import Literal, List, Optional, Sequence
from pydantic import (
    BaseModel,
    Field,
    create_model,
)


# FILE DATA EXTRACTION

## BASE

def date_pattern_2000_to_current_year() -> str:
    current_year = date.today().year
    # Allow years 2000..current_year
    # Build an alternation like: 2000|2001|...|2026
    years = "|".join(str(y) for y in range(2000, current_year + 1))
    # Basic YYYY-MM-DD shape with month/day ranges.
    # (Does not do leap-year/day-per-month correctness; still validated by `date` parsing.)
    return rf"^(?:{years})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$"

DATE_2000_TO_CURRENT_YEAR_PATTERN = date_pattern_2000_to_current_year()


class StrictBaseModel(BaseModel):
    """ Pydantic BaseModel with gpt required config for requests. """
    model_config = {
        "extra": "forbid",
        "json_schema_extra": {"additionalProperties": False},  # gpt api requires this
    }


class DateBaseModel(StrictBaseModel):
    """ Model that includes start and end dates. """
    date_range_start: date = Field(
        ...,
        description='Start date of the statement. Must be >= 2000-01-01',
        json_schema_extra={"pattern": DATE_2000_TO_CURRENT_YEAR_PATTERN},
    )
    date_range_end: date = Field(
        ...,
        description='End date of the statement. Must be >= 2000-01-01',
        json_schema_extra={"pattern": DATE_2000_TO_CURRENT_YEAR_PATTERN},
    )


## SHARED

class PresenceOnlyPydantic(StrictBaseModel):
    """
    Extraction schema for documents that only need to EXIST.

    Some required documents carry nothing an underwriter would pull off them: a signed
    pagare, a photo of the business premises, a CURP printout. Giving each its own schema
    would be ceremony with no payoff, so they all share this one.

    Deliberately NOT reusing `UnknownFileDataPydantic`. That model means "the classifier
    could not tell what this is", which the app relies on as a failure signal - reusing it
    here would make a perfectly good pagare indistinguishable from a document nobody could
    read.
    """
    document_date: Optional[str] = Field(
        ...,
        description='Date printed on the document in ISO format (YYYY-MM-DD), or null if '
                    'it does not show one.',
    )
    is_legible: bool = Field(
        ...,
        description='False if the document is too blurry, cropped or dark to read.',
    )
    summary: str = Field(
        ...,
        description='One short sentence describing what this document is.',
        max_length=200,
    )


## FINANCIALS

class BankStatementPydantic(DateBaseModel):
    bank_name: str = Field(..., description='The name of the bank.')  # TODO later create fixed list of bank names, or add new if unknown


class BalanceSheetPydantic(DateBaseModel):
    total_assets: float = Field(..., description='Total assets.')
    total_liabilities: float = Field(..., description='Total liabilities.')
    total_equity: float = Field(..., description='Total equity.')


class MonthlyNetCashflow(StrictBaseModel):
    date: str = Field(
        ...,
        description="Date in ISO format: YYYY-MM-DD (for example, 2025-12-01)."
    )
    net_cashflow: Optional[float] = Field(
        ...,
        description="Net cashflow for that month."
    )
    inflow: Optional[float] = Field(
        ...,
        description="Total cash inflows for that month."
    )
    outflow: Optional[float] = Field(
        ...,
        description="Total cash outflows for that month."
    )

class CashflowStatementPydantic(DateBaseModel):
    monthly_net_cashflows: List[MonthlyNetCashflow] = Field(
        ...,
        description="One entry per month found in the statement."
    )


class IncomeStatementPydantic(DateBaseModel):
    total_net_income: float = Field(..., description='Total net income in period.')


class UnknownFileDataPydantic(StrictBaseModel):
    """ Fallback if gpt is unable to determine file based on file type name options. """
    reason: str = Field(...,
        description='Reason file_type_name is unknown. Include what the file seems to be.',
        max_length=100,
    )


## TAX / SAT

class ConstanciaDeSituacionFiscalPydantic(DateBaseModel):
    rfc: str = Field(...,
        description='The RFC which is a 12 character string.',
        max_length=12,
        min_length=12,
    )
    razon_social: str = Field(...,
        description='Organization name, known as denominacion or razon social.',
    )
    nombre_de_vialidad: str = Field(...,
        description='Street name, known as nombre de vialidad.',
    )
    codigo_postal: str = Field(...,
        description='Postal code, known as codigo postal.',
        min_length=5,
        max_length=12,
    )


class OpinionDeCumplimientoPydantic(DateBaseModel):
    """Opinion de Cumplimiento de Obligaciones Fiscales - SAT form 32-D."""
    rfc: Optional[str] = Field(...,
        description='RFC the opinion was issued for.',
        max_length=13,
    )
    sentido: str = Field(...,
        description="The opinion's result, normally 'positiva' or 'negativa'.",
        max_length=20,
    )


class DeclaracionAnualPydantic(DateBaseModel):
    """Annual tax return (declaracion anual) for a company."""
    rfc: Optional[str] = Field(...,
        description='RFC of the taxpayer.',
        max_length=13,
    )
    ejercicio: Optional[int] = Field(...,
        description='Fiscal year the return covers, e.g. 2025.',
    )
    ingresos_acumulables: Optional[float] = Field(...,
        description='Total accruable income (ingresos acumulables) for the year.',
    )
    impuesto_causado: Optional[float] = Field(...,
        description='Tax charged for the year (impuesto causado).',
    )


class DeclaracionesProvisionalesPydantic(DateBaseModel):
    """A provisional (monthly) IVA or ISR filing."""
    rfc: Optional[str] = Field(...,
        description='RFC of the taxpayer.',
        max_length=13,
    )
    periodo: str = Field(...,
        description="Period the filing covers, e.g. '2025-07' or 'Julio 2025'.",
        max_length=50,
    )
    tipo_de_impuesto: str = Field(...,
        description="Which tax this filing is for, normally 'IVA' or 'ISR'.",
        max_length=20,
    )
    impuesto_a_cargo: Optional[float] = Field(...,
        description='Amount payable for the period (impuesto a cargo).',
    )


class CfdiFacturasPydantic(DateBaseModel):
    """A CFDI - the Mexican digital tax invoice - issued for income."""
    uuid_fiscal: Optional[str] = Field(...,
        description='The CFDI folio fiscal (UUID).',
        max_length=36,
    )
    emisor_rfc: Optional[str] = Field(...,
        description='RFC of the issuer (emisor).',
        max_length=13,
    )
    receptor_rfc: Optional[str] = Field(...,
        description='RFC of the recipient (receptor).',
        max_length=13,
    )
    total: Optional[float] = Field(...,
        description='Invoice total.',
    )
    moneda: Optional[str] = Field(...,
        description='Currency code, e.g. MXN.',
        max_length=10,
    )


class CfdiNominaPydantic(DateBaseModel):
    """Payroll CFDIs, which corroborate headcount and payroll cost."""
    emisor_rfc: Optional[str] = Field(...,
        description='RFC of the employer issuing the payroll receipts.',
        max_length=13,
    )
    total: Optional[float] = Field(...,
        description='Total payroll amount across the receipts in this file.',
    )
    num_empleados: Optional[int] = Field(...,
        description='How many distinct employees appear in this file.',
    )


class DeclaracionAnualPersonalPydantic(DateBaseModel):
    """Annual tax return for a persona fisica."""
    rfc: Optional[str] = Field(...,
        description='RFC of the individual taxpayer.',
        max_length=13,
    )
    ejercicio: Optional[int] = Field(...,
        description='Fiscal year the return covers, e.g. 2025.',
    )
    ingresos_acumulables: Optional[float] = Field(...,
        description='Total accruable income (ingresos acumulables) for the year.',
    )


## LEGAL / CORPORATE

class ActaConstitutivaPydantic(DateBaseModel):
    """The company's articles of incorporation."""
    razon_social: Optional[str] = Field(...,
        description='Company name as incorporated (denominacion or razon social).',
    )
    fecha_constitucion: Optional[str] = Field(...,
        description='Date of incorporation in ISO format (YYYY-MM-DD).',
    )
    objeto_social: Optional[str] = Field(...,
        description='The stated corporate purpose, summarized in one sentence.',
        max_length=500,
    )
    capital_social: Optional[float] = Field(...,
        description='Share capital stated in the deed.',
    )
    notario_numero: Optional[str] = Field(...,
        description='Number of the notary public who executed the deed.',
        max_length=50,
    )
    folio_mercantil: Optional[str] = Field(...,
        description='Commercial registry folio (folio mercantil), if the deed shows one.',
        max_length=50,
    )


class ActasDeAsambleaPydantic(DateBaseModel):
    """
    Shareholder meeting minutes and amendments made since incorporation.

    Matters because an acta constitutiva can be decades old - capital increases,
    shareholder changes and restructurings all show up here instead.
    """
    fecha_asamblea: Optional[str] = Field(...,
        description='Date the meeting was held, in ISO format (YYYY-MM-DD).',
    )
    tipo_asamblea: Optional[str] = Field(...,
        description="Kind of meeting, e.g. 'ordinaria' or 'extraordinaria'.",
        max_length=50,
    )
    acuerdos_principales: Optional[str] = Field(...,
        description='The main resolutions passed, summarized in one or two sentences.',
        max_length=500,
    )


class PoderNotarialPydantic(DateBaseModel):
    """Notarised power of attorney naming who may sign on the company's behalf."""
    apoderado_nombre: Optional[str] = Field(...,
        description='Full name of the person granted the power (apoderado).',
    )
    tipo_de_poder: Optional[str] = Field(...,
        description="Scope of the power, e.g. 'pleitos y cobranzas', 'actos de "
                    "administracion', 'actos de dominio'.",
        max_length=200,
    )
    notario_numero: Optional[str] = Field(...,
        description='Number of the notary public who executed the instrument.',
        max_length=50,
    )
    fecha_otorgamiento: Optional[str] = Field(...,
        description='Date the power was granted, in ISO format (YYYY-MM-DD).',
    )


class IdentificacionOficialPydantic(DateBaseModel):
    """
    Government-issued photo ID.

    One file type covers INE, passport and driving licence: they prove the same fact, and
    `tipo_identificacion` records which one was actually supplied.
    """
    nombre_completo: Optional[str] = Field(...,
        description='Full name exactly as printed on the document.',
    )
    tipo_identificacion: str = Field(...,
        description="Which document this is, e.g. 'INE', 'pasaporte', 'licencia'.",
        max_length=50,
    )
    numero_identificacion: Optional[str] = Field(...,
        description='Document number (clave de elector, passport number, etc.).',
        max_length=50,
    )
    curp: Optional[str] = Field(...,
        description='CURP if the document shows one.',
        max_length=18,
    )
    vigencia: Optional[str] = Field(...,
        description='Expiry date in ISO format (YYYY-MM-DD), or null if not shown.',
    )


class ComprobanteDeDomicilioPydantic(DateBaseModel):
    """Proof of address - normally a recent utility bill."""
    titular: Optional[str] = Field(...,
        description='Name the service is billed to.',
    )
    direccion: Optional[str] = Field(...,
        description='Full address as printed on the document.',
    )
    tipo_servicio: Optional[str] = Field(...,
        description="Which service the bill is for, e.g. 'CFE', 'agua', 'predial', "
                    "'telefono'.",
        max_length=50,
    )
    codigo_postal: Optional[str] = Field(...,
        description='Postal code (codigo postal).',
        max_length=12,
    )


## CREDIT

class ReferenciaComercial(StrictBaseModel):
    """One trade reference inside a referencias comerciales document."""
    empresa: str = Field(...,
        description='Name of the supplier giving the reference.',
    )
    contacto: Optional[str] = Field(...,
        description='Contact name, phone or email for that supplier.',
    )
    linea_de_credito: Optional[float] = Field(...,
        description='Credit line that supplier extends to the applicant.',
    )
    plazo_dias: Optional[int] = Field(...,
        description='Payment terms in days, e.g. 30.',
    )
    comportamiento_pago: Optional[str] = Field(...,
        description='How the applicant pays, e.g. puntual, retrasos ocasionales.',
        max_length=200,
    )


class ReferenciasComercialesPydantic(DateBaseModel):
    """
    Trade references from the applicant's OTHER suppliers.

    The most trade-credit-specific document in the catalog: it is direct evidence of how
    the applicant pays its peers, which a Buro report does not capture.
    """
    referencias: List[ReferenciaComercial] = Field(...,
        description='One entry per supplier reference listed in the document.',
    )


# GENERAL

def build_file_type_name_pydantic(file_type_keys: Sequence[str]) -> type[StrictBaseModel]:
    """
    Build the model constraining GPT's document-classification answer to a known set of
    file type names.

    This is built per call rather than declared once at import because the set of valid
    names comes from the file type catalog, and will eventually also include the
    file types a specific organization has defined for itself (see `docs/versions/v2.md`).
    A module-level `Literal[...]` would freeze that set at process start.

    `create_model` is pydantic's programmatic equivalent of writing out a class body;
    `Literal[tuple(...)]` is the same as writing `Literal['a', 'b', ...]` by hand.
    """
    return create_model(
        'FileTypeNamePydantic',
        file_type_name=(Literal[tuple(file_type_keys)], ...),
        __base__=StrictBaseModel,
    )
