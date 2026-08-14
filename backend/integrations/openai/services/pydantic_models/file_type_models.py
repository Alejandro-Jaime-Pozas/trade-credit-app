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


# LEGAL

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
