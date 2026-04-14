from typing import Literal
from pydantic import (
    Field,
)

from .file_type_models import (
    StrictBaseModel,
)


# LOAN VERDICT

class LoanVerdictAIPydantic(StrictBaseModel):
    """ CRITICAL: This model must be linked to processing.models.LoanVerdictAI. """
    status: Literal["approved", "rejected"]
    loan_amount: float = Field(..., description="Total approved loan amount in MXN")
    annual_interest_rate: float = Field(..., description="Rate as decimal", ge=0.0, le=1.0)
    payment_amount: float = Field(..., description="Monthly payment in MXN")
    term_months: int = Field(..., description="Loan term in whole months", ge=0)
    analysis_summary: str = Field(...,
        description="Natural-language analysis explanation of the decision process.",
        max_length=1500,
        min_length=500,
    )
