from typing import Literal

from openai import OpenAI
from pydantic import BaseModel, Field

from backend.integrations.openai.prompts.create_loan import (
    ANALYZE_APPROVE_AND_CREATE_LOAN,
)
from backend.integrations.openai.error_handling import (
    handle_response_has_no_attr_output_text,
    handle_response_status_incomplete,
    handle_get_json_data,
    log_gpt_response,
    check_if_output_in_response_output_list,
)


# 2. Pydantic model you actually want in Python
class LoanVerdictResponseGPT(BaseModel):
    status: Literal["approved", "rejected"]
    loan_amount: float = Field(..., description="Total approved loan amount in MXN")
    annual_interest_rate: float = Field(..., description="Rate as decimal", ge=0.0, le=1.0)
    payment_amount: float = Field(..., description="Monthly payment in MXN")
    term_months: int = Field(..., description="Loan term in whole months", ge=1)
    analysis_summary: str = Field(...,
        description="Natural-language analysis explanation of the decision process.",
        max_length=1500
    )

    model_config = {
        "extra": "forbid",
        "json_schema_extra": {"additionalProperties": False},  # api requires this
    }


loan_details_schema = LoanVerdictResponseGPT.model_json_schema()
# print(json.dumps(loan_details_schema, indent=2))  # to check the auto-gen schema structure

client = OpenAI()

pdf_path = '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/cashflows/cashflow_2_domus.pdf'
print(pdf_path)

# 1. Upload the PDF - THIS UPLOADS A NEW ONE EACH TIME.
with open(pdf_path, "rb",) as f:
    file = client.files.create(
        file=f,
        purpose="user_data",
    )

# 4. Call responses.create with file + schema
response = client.responses.create(
    model="gpt-5-nano",  # can use smarter models later..
    input=[
        {
            "role": "system",  # use system role for unchanging prompt data feeds
            "content": [
                {
                    "type": "input_text",
                    "text": ANALYZE_APPROVE_AND_CREATE_LOAN,
                },
            ],
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "file_id": file.id,
                },
            ]
        },
    ],
    text={
        "format": {
            "type": "json_schema",
            "name": "LoanVerdictResponseGPT",
            "strict": True,
            "schema": loan_details_schema,
        },
    },
    max_output_tokens=10_000,  # hard limit on tokens, if not enough no response
)


# 5. Parse JSON string into your Pydantic model
# Check response status first
if response.status == 'incomplete':
    handle_response_status_incomplete(response)

# Check if output_text attribute exists
if not hasattr(response, 'output_text'):
    handle_response_has_no_attr_output_text(response)

raw_json = response.output_text  # model returns JSON string due to response_format

# Debug: Print the raw response to understand its structure
log_gpt_response(response, raw_json)

# Check if response has attr output to further debug
if not raw_json or raw_json.strip() == "":
    check_if_output_in_response_output_list(response)


data = handle_get_json_data(raw_json)

loan_details = LoanVerdictResponseGPT.model_validate(data)

# Output the parsed loan details
print('\n=== LOAN DECISION ===')
print('Status:', loan_details.status)
print('Loan Amount:', loan_details.loan_amount)
print('Annual Interest Rate:', f"{loan_details.annual_interest_rate * 100:.2f}%")
print('Monthly Payment:', loan_details.payment_amount)
print('Term:', loan_details.term_months, 'months')
print('\nDecision Summary:')
print(loan_details.analysis_summary)



# OUTPUT v2

# DEBUG: Response status: completed
# DEBUG: response.output_text:
# '{"status":"approved","loan_amount":1200000,"annual_interest_rate":0.12,"payment_amount":73400,"term_months":18,"analysis_summary":"Decision rationale: The 12-month cash flow for Domus shows consistent positive net cash flow (Total inflows MXN 4,455,000 vs Total outflows MXN 3,220,000; Net cash flow MXN 1,235,000) with an ending cash balance of MXN 1,385,000, indicating ample liquidity to support modest debt service. Cash flow has a positive trajectory across the year (net cash flow rising from MXN 70,000 in Jan to MXN 135,000 in Dec), which supports repayment capacity going forward. Proposed terms: a loan of MXN 1,200,000 amortized over 18 months at 12% annual interest, resulting in a monthly payment of approximately MXN 73,400. Total payments over the term are about MXN 1,321,200. The annual debt service, about MXN 881,000 (1,321,200 / 1.5 years), is well covered by the annualized cash flow (~MXN 1,235,000 per year), yielding an approximate DSCR of 1.40. The combination of solid liquidity, improving cash generation, and a debt service burden within existing cash flow capacity supports approval under these terms."}'

# === LOAN DECISION ===
# Status: approved
# Loan Amount: 1200000.0
# Annual Interest Rate: 12.00%
# Monthly Payment: 73400.0
# Term: 18 months

# Decision Summary:
# Decision rationale: The 12-month cash flow for Domus shows consistent positive net cash flow (Total inflows MXN 4,455,000 vs Total outflows MXN 3,220,000; Net cash flow MXN 1,235,000) with an ending cash balance of MXN 1,385,000, indicating ample liquidity to support modest debt service. Cash flow has a positive trajectory across the year (net cash flow rising from MXN 70,000 in Jan to MXN 135,000 in Dec), which supports repayment capacity going forward. Proposed terms: a loan of MXN 1,200,000 amortized over 18 months at 12% annual interest, resulting in a monthly payment of approximately MXN 73,400. Total payments over the term are about MXN 1,321,200. The annual debt service, about MXN 881,000 (1,321,200 / 1.5 years), is well covered by the annualized cash flow (~MXN 1,235,000 per year), yielding an approximate DSCR of 1.40. The combination of solid liquidity, improving cash generation, and a debt service burden within existing cash flow capacity supports approval under these terms.



# OUTPUT v1

# DEBUG: Response status: completed
# DEBUG: response.output_text:
# '{"status":"approved","loan_amount":800000,"annual_interest_rate":0.10,"payment_amount":69893,"term_months":12,"analysis_summary":"Decision: Approved. Rationale: The 12-month cash flow for Domus, S.A. de C.V. shows strong, positive cash generation: total inflows MXN 4,455,000 vs total outflows MXN 3,220,000, resulting in net cash flow of MXN 1,235,000 and ending cash balance of MXN 1,385,000. The monthly net cash flow averages about MXN 102,917, indicating durable liquidity. Proposed loan: MXN 800,000 to be repaid over 12 months at 10% annual interest. Estimated monthly payment: ~MXN 69,893. This yields an overall debt-service coverage ratio (DSCR) ranging from ~1.0 in the weakest month (January) to ~1.5 in stronger months, with an average DSCR ≈ 1.47. This level of coverage is adequate given current cash generation and liquidity, suggesting the company can service the debt while preserving liquidity. No collateral details are provided; standard covenants are recommended (e.g., DSCR minimum threshold around 1.25x, caps on additional indebtedness and distributions) and a pre-disbursement review should confirm working-capital usage. Risk considerations: while cash flow is favorable, the seasonality and low-end DSCR in the first month should be monitored; if quarterly cash flow deteriorates, reevaluate the facility. Recommendation: Approve under standard unsecured working-capital terms with covenants and monitoring."}'

# === LOAN DECISION ===
# Status: approved
# Loan Amount: 800000
# Annual Interest Rate: 10.00%
# Monthly Payment: 69893
# Term: 12 months

# Decision Summary:
# Decision: Approved. Rationale: The 12-month cash flow for Domus, S.A. de C.V. shows strong, positive cash generation: total inflows MXN 4,455,000 vs total outflows MXN 3,220,000, resulting in net cash flow of MXN 1,235,000 and ending cash balance of MXN 1,385,000. The monthly net cash flow averages about MXN 102,917, indicating durable liquidity. Proposed loan: MXN 800,000 to be repaid over 12 months at 10% annual interest. Estimated monthly payment: ~MXN 69,893. This yields an overall debt-service coverage ratio (DSCR) ranging from ~1.0 in the weakest month (January) to ~1.5 in stronger months, with an average DSCR ≈ 1.47. This level of coverage is adequate given current cash generation and liquidity, suggesting the company can service the debt while preserving liquidity. No collateral details are provided; standard covenants are recommended (e.g., DSCR minimum threshold around 1.25x, caps on additional indebtedness and distributions) and a pre-disbursement review should confirm working-capital usage. Risk considerations: while cash flow is favorable, the seasonality and low-end DSCR in the first month should be monitored; if quarterly cash flow deteriorates, reevaluate the facility. Recommendation: Approve under standard unsecured working-capital terms with covenants and monitoring.
