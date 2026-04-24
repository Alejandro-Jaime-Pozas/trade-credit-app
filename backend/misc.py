rev_gen = reversed([1,2,3])
for v in rev_gen:
    print(v)


# # TODO fix growth trend percent since doesn't take into acct the growth % as a % of start/end cashflow...cashflow can be trending -5%
# def get_growth_trend_metrics(cashflow_series: list[float]) -> dict[str, float]:
#     """
#     Fit a straight line to monthly cash flow:
#         cashflow = intercept + slope * month_index

#     Returns:
#       - trend_slope: currency change per month
#       - trend_percent_per_month: slope / mean cash flow
#     """

#     # TODO if cashflow declining and dscr < 1 any point during the forecast loan term, reject loan

#     n = len(cashflow_series)
#     if n < 3:
#         raise ValueError("At least 3 months are required to estimate a trend.")

#     x_values = list(range(1, n + 1))
#     x_mean = sum(x_values) / n
#     y_mean = sum(cashflow_series) / n  # regression requires arithmetic mean

#     numerator = sum(
#         (x - x_mean) * (y - y_mean)
#         for x, y in zip(x_values, cashflow_series)
#     )
#     denominator = sum((x - x_mean) ** 2 for x in x_values)

#     if denominator == 0:
#         raise ValueError("Cannot compute trend slope (denominator is zero).")

#     slope = numerator / denominator  # currency per month ie.

#     if abs(y_mean) < 1e-9:
#         trend_percent_per_month = float("inf")
#     else:
#         trend_percent_per_month = slope / abs(y_mean)  # fraction per month ie.

#     return {
#         "trend_slope": slope,
#         "trend_percent_per_month": trend_percent_per_month,
#     }

# c = [7000, 5000, -3000, -5000, 5000, 2000, -5000, 5000, -5000, 5000, -3000, 5000]

# print(get_growth_trend_metrics(c))


# from core.constants import METRIC_CONFIG


# def check_if_passes_min_threshold(
#     metrics: dict,  # name, value
#     metric_config: dict = METRIC_CONFIG,
# ) -> dict:
#     """
#     Check if a metric passes its minimum requirement.

#     Returns dict.
#     """

#     passes = {
#         'passed': True,
#         'metrics': {}
#     }

#     for name, cfg in metric_config.items():
#         # Skip checks if metric wasn't provided
#         print(name)
#         if name not in metrics:
#             continue

#         value = metrics[name]
#         threshold = cfg["threshold"]
#         comparator = cfg["comparator"]

#         # If metric value < min threshold, fails requirements, log response
#         if not comparator(float(value), float(threshold)):  # comparator(value, threshold)
#             if passes['passed'] == True:
#                 passes['passed'] = False
#             passes['metrics'][name] = {
#                 'value': value,
#                 'threshold': threshold,
#                 'reason': f'Value for {name}: {value} does not pass threshold: {threshold}',
#             }

#     return passes


# metrics = {
#     'dscr': 1.12,
#     'residual_volatility': 0.49,
# }

# print(check_if_passes_min_threshold(metrics))



# def get_growth_trend_metrics(cashflow_series: list[float]) -> dict[str, float]:
#     """
#     Fit a straight line to monthly cash flow:
#         cashflow = intercept + slope * month_index

#     Returns:
#       - trend_slope: currency change per month
#       - trend_percent_per_month: slope / mean cash flow
#     """

#     # TODO if cashflow declining and dscr < 1 any point during the forecast loan term, reject loan

#     n = len(cashflow_series)
#     if n < 3:
#         raise ValueError("At least 3 months are required to estimate a trend.")

#     x_values = list(range(1, n + 1))
#     x_mean = sum(x_values) / n
#     y_mean = sum(cashflow_series) / n  # regression requires arithmetic mean

#     numerator = sum(
#         (x - x_mean) * (y - y_mean)
#         for x, y in zip(x_values, cashflow_series)
#     )
#     denominator = sum((x - x_mean) ** 2 for x in x_values)

#     if denominator == 0:
#         raise ValueError("Cannot compute trend slope (denominator is zero).")

#     slope = numerator / denominator  # currency per month ie.

#     if abs(y_mean) < 1e-9:
#         trend_percent_per_month = float("inf")
#     else:
#         trend_percent_per_month = slope / abs(y_mean)  # fraction per month ie.

#     return {
#         "trend_slope": slope,
#         "trend_percent_per_month": trend_percent_per_month,
#     }

# print(get_growth_trend_metrics([-40000, -55000, -70000, -85000, -95000, -105000, -115000, -125000, -135000, -145000, -155000, -165000]))


# x = [1234]
# x.append(12)
# x.extend([2334, 4, 59])
# x += [3,4,5]
# print(x)


# def get_growth_trend_metrics(cashflow_series: list[float]) -> dict[str, float]:
#     """
#     Fit a straight line to monthly cash flow:
#         cashflow = intercept + slope * month_index

#     Returns:
#       - trend_slope: currency change per month
#       - trend_percent_per_month: slope / mean cash flow
#     """

#     n = len(cashflow_series)
#     if n < 3:
#         raise ValueError("At least 3 months are required to estimate a trend.")

#     x_values = list(range(1, n + 1))
#     x_mean = sum(x_values) / n
#     y_mean = sum(cashflow_series) / n  # regression requires arithmetic mean

#     numerator = sum(
#         (x - x_mean) * (y - y_mean)
#         for x, y in zip(x_values, cashflow_series)
#     )
#     denominator = sum((x - x_mean) ** 2 for x in x_values)

#     if denominator == 0:
#         raise ValueError("Cannot compute trend slope (denominator is zero).")

#     slope = numerator / denominator  # currency per month ie. $5,000 avg growth in cashflow per month

#     if abs(y_mean) < 1e-9:
#         trend_percent_per_month = float("inf")
#     else:
#         trend_percent_per_month = slope / y_mean  # fraction per month ie. 5.8% avg growth per month

#     return {
#         "trend_slope": slope,
#         "trend_percent_per_month": trend_percent_per_month,
#     }


# print(get_growth_trend_metrics(
#     #     [
#     #     70000,
#     #     75000,
#     #     80000,
#     #     88000,
#     #     95000,
#     #     102000,
#     #     110000,
#     #     113000,
#     #     115000,
#     #     122000,
#     #     130000,
#     #     135000,
#     # ]
#     [
#         135000,
#         130000,
#         122000,
#         115000,
#         113000,
#         110000,
#         102000,
#         95000,
#         88000,
#         80000,
#         75000,
#         70000,
#     ]
# ))


# import math

# # TODO still missing trend implementation...if cashflow growing, shrinking, etc
# # TODO later add worst-month coverage for better results

# def get_avg_monthly_cashflow(cashflow_series: list[float]) -> float:

#     n = len(cashflow_series)
#     mean = sum(cashflow_series) / n

#     return mean


# def get_median_value(values: list[float]) -> float:
#     if not values:
#         raise ValueError('Values cannot be empty.')

#     n = len(values)

#     # sort the values ascending
#     sorted_values = sorted(values)
#     mid = n // 2

#     # if values odd, get the middle value of sorted values
#     if n % 2 != 0:
#         median = sorted_values[(mid)]
#     else:
#         median = (sorted_values[mid] + sorted_values[(mid) - 1]) / 2

#     return median


# def get_dscr(
#     cashflow_series: list[float],
#     monthly_debt_payments: list[float],
# ) -> float:
#     """
#     Get the debt service coverage ratio.

#     Requires total existing monthly debt payments and average monthly cashflow.

#     Best to use average vs median since all net cashflows are important.
#     """

#     mean = get_avg_monthly_cashflow(cashflow_series)

#     return mean / monthly_debt_payments


# def get_residual_volatility(cashflow_series: list[float]) -> float:
#     """
#     Calculate trend-adjusted volatility using linear regression residuals.

#     This removes linear growth/decline and measures only instability
#     around the trend line.

#     Constraints:
#         - Requires at least 3 months of cashflows.

#     Returns:
#         Residual volatility as a percentage of mean cash flow.
#     """

#     n = len(cashflow_series)

#     if n < 3:
#         raise ValueError("At least 3 data points are required for regression-based volatility.")

#     # Create time index: 1..n
#     x_values = list(range(1, n + 1))

#     x_mean = sum(x_values) / n
#     y_mean = get_median_value(cashflow_series)
#     # y_mean = sum(cashflow_series) / n  # if want avg w/o outliers

#     # Compute regression slope (b)
#     numerator = sum(
#         (x - x_mean) * (y - y_mean)
#         for x, y in zip(x_values, cashflow_series)
#     )

#     denominator = sum(
#         (x - x_mean) ** 2
#         for x in x_values
#     )

#     if denominator == 0:
#         raise ValueError("Cannot compute regression slope (denominator is zero).")

#     slope = numerator / denominator

#     # Compute intercept (a)
#     intercept = y_mean - slope * x_mean

#     # Compute residuals
#     residuals = [
#         y - (intercept + slope * x)
#         for x, y in zip(x_values, cashflow_series)
#     ]

#     # Sum of squared residuals
#     sse = sum(r ** 2 for r in residuals)

#     # Regression residual standard deviation (divide by n - 2)
#     residual_std_dev = math.sqrt(sse / (n - 2))

#     # Avoid divide-by-zero
#     if abs(y_mean) < 1e-9:
#         raise ValueError("Mean cash flow too close to zero for percentage volatility calculation.")

#     # Scale-free volatility
#     residual_volatility = residual_std_dev / y_mean

#     return residual_volatility



# print(get_residual_volatility(
# # print(sorted(
#     [
#         70000,
#         75000,
#         80000,
#         88000,
#         95000,
#         102000,
#         110000,
#         113000,
#         115000,
#         122000,
#         130000,
#         135000,
#     ]
#     # [
#     #     135000,
#     #     130000,
#     #     122000,
#     #     115000,
#     #     113000,
#     #     110000,
#     #     102000,
#     #     95000,
#     #     88000,
#     #     80000,
#     #     75000,
#     #     70000,
#     # ]
#     # ))
# ))


# # repayment score
# dscr={
#     2.00: 0,
#     1.75: 10,
#     1.50: 25,
#     1.25: 50,
#     1.10: 75,
#     0.00: 100,
# }

# vlty={
#     0.05: 0,
#     0.15: 25,
#     0.30: 60,
#     float('inf'): 100,
# }


# def score_dscr(n: float) -> int:
#     for res, score in dscr.items():
#         if n >= res:
#             return score
#     raise ValueError('Must include a positive number.')


# def score_residual_volatility(n: float) -> int:
#     for res, score in vlty.items():
#         if n <= res:
#             return score
#     raise ValueError('Must include a positive number.')


# def score_repayment_capacity(
#     dscr_res: float,
#     residual_volatility_res: float,
# ):
#     dscr_score = score_dscr(dscr_res)
#     res_volatility_score = score_residual_volatility(residual_volatility_res)

#     return \
#         dscr_score * .65 \
#         + res_volatility_score * .35


# print(score_repayment_capacity(0.8, 0.037))



# def score_residual_volatility(n: float) -> int:
#     for res, score in {
#     0.05: 0,
#     0.15: 25,
#     0.30: 60,
#     float('inf'): 100,
# }.items():
#         if n <= res:
#             return score
#     raise ValueError('Must include a positive number.')


# print(score_residual_volatility(0.15))




# import json

# bdc_reports = [
#     json.loads('{"a": 1}')
# ]

# json_objects = [json.dumps(r) for r in bdc_reports]
# json_objects2 = [r for r in bdc_reports]

# print(type(json_objects[0]))
# print(type(json_objects2[0]))

# from dateutil.relativedelta import relativedelta
# from datetime import date

# from core.str_utils import pretty_print
# from core.constants import (
#     LOAN_FILE_TYPE_NAMES_REQUIRED,
#     LOAN_FILE_MONTHS_REQUIRED_FINANCIALS,
#     MAX_FILE_MONTHS_BACK,
# )
# from core.date_utils import (
#     get_current_date,
# )
# # from processing.models import AccountApplication


# file_type_names = LOAN_FILE_TYPE_NAMES_REQUIRED
# months_required = LOAN_FILE_MONTHS_REQUIRED_FINANCIALS
# max_months_back = MAX_FILE_MONTHS_BACK


# def get_months_satisfied_uploaded_documents(
#     acct_app #AccountApplication,
# ):
#     """
#     Return a dict of all file type names, their required months,
#     and whether any existing AccountApplication file satisfies
#     a required month(s).

#     Returns dict.
#     """

# #
# def build_possible_month_intervals(file_type_name: str):
#     """
#     Depending on the file_type_name, build the possible date range
#     the files must satisfy. Possible here means months that are
#     eligible within the specified timeframe (could be a list of 14
#     possible dates, of which 12 are later final and required).

#     Returns dict.
#     """

#     # If file_type_name has a month requirement (some won't like Acta Constitutiva)
#     if file_type_name in months_required.keys():

#         # Use months required and min start/end dates to build possible month(s) given the file_type_name
#         possible_months = months_required[file_type_name] + max_months_back - 1

#         current_date = get_current_date()
#         start_month_date = current_date - relativedelta(months=possible_months)

#         months_dict = {}
#         d = start_month_date
#         while d <= current_date:
#             months_dict[d] = False
#             d += relativedelta(months=1)

#         return months_dict

#     else:
#         raise ValueError(f"'{file_type_name}' is not a valid value, must be one of: " \
#             f"\n\t{pretty_print(file_type_names)}"
#             )


# def build_aggregate_possible_month_intervals(file_type_names: set):
#     """
#     Returns an aggregate dict of dictionaries, one for each required
#     loan file type name depending on possible month intervals required
#     to satisfy that file's requirements.
#     """

#     all_files_possible_months = {}
#     for name in file_type_names:
#         all_files_possible_months[name] = build_possible_month_intervals(name)

#     return all_files_possible_months


# def check_satisfied_month_intervals(
#     file_type_name: str,
# ):
#     """
#     Returns a dict with the possible month intervals for a specific
#     file_type_name, and checks if those values are true or false.
#     """

#     # Get the possible month intervals for the file_type_name
#     verified_months = build_possible_month_intervals(file_type_name)  # dict w/1+ month invervals which all equal False

#     # For each filtered doc, check start/end dates, set all values between start and end per file as True in verified_months dict

#     start = '2026-02-20'
#     end = '2026-02-20'

#     # If start and end, set those months (and months in between) to true in verfied_months, if they're included in verified_months options
#     if start and end:
#         start = date.fromisoformat(start) - relativedelta(day=1)
#         end = date.fromisoformat(end) - relativedelta(day=1)

#         month_intervals = set()
#         cur = start
#         while cur <= end:
#             month_intervals.add(cur)
#             cur += relativedelta(months=1)

#         # For each key in verified_months, check if it's in the month_intervals, or the other way around...
#         verified_months_keys = verified_months.keys()
#         for month in verified_months_keys:
#             if month in month_intervals:
#                 verified_months[month] = True

#     return verified_months


# def check_file_required_dates_complete(
#         file_type_name: str,
# ):
#     """
#     Check if an AccountApplication's date/month requirements for a
#     specific UploadDocument file_type_name have been satisfied.

#     Returns bool.
#     """

#     # Get a specific file_type_name's satisfied dates
#     doc_satisfied_months = check_satisfied_month_intervals(
#         file_type_name=file_type_name,
#     )

#     # doc_satisfied_months = {datetime.date(2024, 12, 1): False, datetime.date(2025, 1, 1): False, datetime.date(2025, 2, 1): False, datetime.date(2025, 3, 1): False, datetime.date(2025, 4, 1): False, datetime.date(2025, 5, 1): False, datetime.date(2025, 6, 1): True, datetime.date(2025, 7, 1): True, datetime.date(2025, 8, 1): True, datetime.date(2025, 9, 1): True, datetime.date(2025, 10, 1): True, datetime.date(2025, 11, 1): True, datetime.date(2025, 12, 1): False, datetime.date(2026, 1, 1): False}

#     # Check if all required dates satisfied
#     count = 0
#     required = months_required[file_type_name]

#     for value in doc_satisfied_months.values():
#         if value == False:
#             count = 0
#         elif value == True:
#             count += 1
#         if count == required:
#             # File date requirements are satisfied, mark as complete
#             return file_type_name, True

#     return file_type_name, False


# print(check_file_required_dates_complete('balance_sheet'))



# # dates = list(build_possible_month_intervals('bank_statement').keys())
# # extracted_data = '2025-02-28'
# # d = date.fromisoformat(extracted_data)
# # d = d - relativedelta(day=1)
# # print(d)
# # print(dates)
# # print(d in dates)
# verified_months = build_possible_month_intervals('bank_statement')

# start = '2025-06-25'
# end = '2025-11-30'

# # If start and end, set those months (and months in between) to true in verfied_months, if they're included in verified_months options
# if start and end:
#     start = date.fromisoformat(start) - relativedelta(day=1)
#     end = date.fromisoformat(end) - relativedelta(day=1)

#     month_intervals = set()
#     cur = start
#     while cur <= end:
#         month_intervals.add(cur)
#         cur += relativedelta(months=1)

#     # For each key in verified_months, check if it's in the month_intervals, or the other way around...
#     verified_months_keys = verified_months.keys()
#     for month in verified_months_keys:
#         if month in month_intervals:
#             verified_months[month] = True

# print(verified_months)


# from datetime import date
# import json
# from os import path
# from typing import Literal, Union, List
# from django.conf import settings
# from pydantic import (
#     BaseModel,
#     Field,
# )

# from openai import OpenAI
# from openai.types.file_object import FileObject

# # from storage.models import UploadDocument
# from core.constants import FILE_TYPE_NAME_MAPPING_PYDANTIC, UPLOAD_DOCUMENT_FILE_TYPE_NAMES
# from integrations.openai.prompts.extract_file_data import (
#     EXTRACT_FILE_DATA,
#     EXTRACT_FILE_TYPE_NAME,
#     get_file_data_prompt,
# )
# # from processing.serializers import LoanVerdictAISerializer
# # from integrations.openai.error_handling import (
# #     check_if_output_in_response_output_list,
# #     handle_get_json_data,
# #     handle_response_has_no_attr_output_text,
# #     handle_response_status_incomplete,
# #     log_gpt_response,
# # )
# from integrations.openai.constants import (
#     GPT_MODEL_VERSION,
#     MAX_OUTPUT_TOKENS,
# )
# # from integrations.openai.prompts.create_loan import (
# #     ANALYZE_APPROVE_AND_CREATE_LOAN,
# # )
# # from processing.models import (
# #     AccountApplication,
# #     LoanVerdictAI,
# # )


# # FILE DATA EXTRACTION

# class StrictBaseModel(BaseModel):
#     """ Pydantic BaseModel with gpt required config for requests. """
#     model_config = {
#         "extra": "forbid",
#         "json_schema_extra": {"additionalProperties": False},  # gpt api requires this
#     }


# class BankStatementPydantic(StrictBaseModel):
#     # file_type_name: Literal['bank_statement']
#     bank_name: str = Field(..., description='The name of the bank.')  # TODO later create fixed list of bank names, or add new if unknown
#     date_range_start: date = Field(..., description='start date of the bank statement.')
#     date_range_end: date  = Field(..., description='end date of the bank statement.')


# class UnknownFileDataPydantic(StrictBaseModel):
#     """ Fallback if gpt is unable to determine file based on file type name options. """
#     # file_type_name: Literal['unknown']
#     reason: str = Field(...,
#         description='Reason file is unknown.',
#         max_length=100,
#     )


# class FileTypeNamePydantic(StrictBaseModel):
#     file_type_name: Literal[*UPLOAD_DOCUMENT_FILE_TYPE_NAMES]


# FILE_TYPE_NAME_SCHEMA = FileTypeNamePydantic.model_json_schema()


# # LOAN VERDICT

# class LoanVerdictAIPydantic(StrictBaseModel):
#     """ CRITICAL: This model must be linked to processing.models.LoanVerdictAI. """
#     status: Literal["approved", "rejected"]
#     loan_amount: float = Field(..., description="Total approved loan amount in MXN")
#     annual_interest_rate: float = Field(..., description="Rate as decimal", ge=0.0, le=1.0)
#     payment_amount: float = Field(..., description="Monthly payment in MXN")
#     term_months: int = Field(..., description="Loan term in whole months", ge=0)
#     analysis_summary: str = Field(...,
#         description="Natural-language analysis explanation of the decision process.",
#         max_length=1500,
#         min_length=500,
#     )


# LOAN_DETAILS_SCHEMA = LoanVerdictAIPydantic.model_json_schema()


# class GPTService:
#     """
#     Service that connects to openai gpt api to make requests such as
#     specific prompts, uploading files, deleting files.
#     """

#     # Conncect to OpenAI API via api key
#     def __init__(self, account_application='a'):
#         # TODO later create global openai client, since more efficient
#         self.client = OpenAI()  # defaults to system env var OPENAI_API_KEY's value
#         self.account_application = account_application

#     # Upload a specific file to openai api
#     def upload_file(self, file_path: str):
#         """ Upload a single file to openai api. """
#         with open(file_path, 'rb') as f:
#             file = self.client.files.create(
#                 file=f,
#                 purpose='user_data',
#                 expires_after={'anchor': 'created_at', 'seconds': 2592000},
#             )

#         return file  # contains an id field

#     # Upload multiple files to openai api
#     def upload_files(self, file_paths_list: list[str]):
#         """ Upload multiple files to openai api. """
#         uploaded_files = []

#         for file_path in file_paths_list:
#             file = self.upload_file(file_path)
#             uploaded_files.append(file)

#         return uploaded_files

#     # Create json input-ready list with dict to include in gpt request
#     def prep_files_for_request(self, uploaded_files):
#         prepped_files = [{"type": "input_file", "file_id": f.id} for f in uploaded_files]

#         return prepped_files

#     # Delete all files
#     def delete_files(self):
#         """ Delete files from openai api if no longer required. """
#         files = self.client.files.list()

#         file_ids = [f.id for f in files.data]

#         deleted_files = []
#         for file in file_ids:
#             res = self.client.files.delete(file)
#             deleted_files.append(res)

#         return deleted_files  # could later remove this, just check endpoint?

#     def get_pydantic_model_json_schema(self, file_type_name):
#         model = FILE_TYPE_NAME_MAPPING_PYDANTIC.get(file_type_name)
#         if model:
#             return model.model_json_schema()

#     # Request structured json response based on file and prompt input
#     def get_gpt_file_type_name(self, uploaded_file: FileObject):
#         response = self.client.responses.create(
#             model=GPT_MODEL_VERSION,  # can use smarter models later..
#             input=[
#                 {
#                     "role": "system",  # use system role for unchanging prompt data feeds
#                     "content": [
#                         {
#                             "type": "input_text",
#                             "text": EXTRACT_FILE_TYPE_NAME,
#                         },
#                     ],
#                 },
#                 {
#                     "role": "user",
#                     "content": [
#                         {
#                             "type": "input_file",
#                             "file_id": uploaded_file.id,
#                         },
#                     ]
#                 },
#             ],
#             text={
#                 "format": {
#                     "type": "json_schema",
#                     "name": "FileTypeNamePydantic",
#                     "strict": True,
#                     "schema": FILE_TYPE_NAME_SCHEMA,
#                 },
#             },
#             max_output_tokens=MAX_OUTPUT_TOKENS,  # hard limit on tokens, if not enough no response
#         )

#         return response

#     # Request structured json response based on file and prompt input
#     def get_gpt_file_data(
#         self,
#         uploaded_file: FileObject,
#         file_type_name: str,
#     ):
#         response = self.client.responses.create(
#             model=GPT_MODEL_VERSION,  # can use smarter models later..
#             input=[
#                 {
#                     "role": "system",  # use system role for unchanging prompt data feeds
#                     "content": [
#                         {
#                             "type": "input_text",
#                             "text": get_file_data_prompt(file_type_name),
#                         },
#                     ],
#                 },
#                 {
#                     "role": "user",
#                     "content": [
#                         {
#                             "type": "input_file",
#                             "file_id": uploaded_file.id,
#                         },
#                     ]
#                 },
#             ],
#             text={
#                 "format": {
#                     "type": "json_schema",
#                     "name": file_type_name,  # check if name even matters what you put in
#                     "strict": True,
#                     "schema": self.get_pydantic_model_json_schema(file_type_name),
#                 },
#             },
#             max_output_tokens=MAX_OUTPUT_TOKENS,  # hard limit on tokens, if not enough no response
#         )

#         return response


# gpt = GPTService()
# uploaded_file = gpt.upload_file(
#     '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/Domus_docs/bank_statements/BBVA_Abril_2023_Ecommerce.pdf'
#     # '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/Domus_docs/Domus_Income_Statement_LTM.pdf'
#     # '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/Domus_docs/Domus_Cashflow_Statement.pdf'
#     # '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/Domus_docs/Domus_Balance_Sheet_LTM.pdf'
#     # '/Users/Alex/Documents/Coding/Applications/Sol_Bank/backend/financial_statements/Domus_docs/CV - Alejandro Jaime.pdf'
# )
# res1 = gpt.get_gpt_file_type_name(uploaded_file)
# print(res1.output_text)
# data = json.loads(res1.output_text)
# file_type_name = data['file_type_name']
# print(file_type_name)
# res2 = gpt.get_gpt_file_data(uploaded_file, file_type_name)
# data = json.loads(res2.output_text)  # turns json str to dict
# print(type(data))
# print(data)
# # jan 2023-dec 2023


# number = 0

# if not number:
#     print('no number')


# def create_account_number(pk):
#     pk_len = len(str(pk))
#     zero_prefix_len = 11 - pk_len
#     return '0'*zero_prefix_len + str(pk)


# print(create_account_number(3))


# # SAMPLE PDF FILE CREATION WITH REPORTLAB

# from pathlib import Path
# from io import BytesIO

# from reportlab.lib.pagesizes import LETTER
# from reportlab.lib.styles import getSampleStyleSheet
# from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
# from reportlab.lib.units import inch


# text = """
# with the following terms:

# 1) LOAN AMOUNT

# 2) INTEREST
# (the “Annual Interest Rate”), calculated on a 365-day basis, simple interest unless otherwise required
# by applicable law.

# 3) TERM

# 4) PAYMENTS
# Loan (including principal and accrued interest) is paid in full.
# Payments shall be applied first to accrued interest and then to principal.

# 5) PREPAYMENT
# Borrower may prepay all or any portion of the outstanding balance at any time without penalty.
# Any partial prepayment will first be applied to accrued interest, then principal.

# 6) LATE FEES (OPTIONAL)

# 7) DEFAULT
# Borrower will be in default if: (a) any payment is more than 5 days late; or
# (b) Borrower materially breaches this Agreement.
# Upon default, Lender may declare the entire unpaid principal and accrued interest immediately due
# and payable, subject to applicable law.

# 9) ENTIRE AGREEMENT
# This Agreement contains the entire understanding between the parties and supersedes all prior
# discussions. Any amendment must be in writing and signed by both parties.

# 10) ELECTRONIC SIGNATURES
# The parties agree that electronic signatures and electronic records are intended to be legally binding
# to the fullest extent permitted by law. Each party represents that they have authority to enter into
# this Agreement.
# """


# def create_pdf_on_desktop():
#     desktop_path = Path.home() / "Desktop" / "loan_agreement_test.pdf"

#     doc = SimpleDocTemplate(
#         str(desktop_path),
#         pagesize=LETTER,
#         leftMargin=1 * inch,
#         rightMargin=1 * inch,
#         topMargin=1 * inch,
#         bottomMargin=1 * inch,
#         title="Loan Agreement",
#     )

#     styles = getSampleStyleSheet()
#     normal = styles["Normal"]
#     normal.fontName = "Helvetica"
#     normal.fontSize = 11
#     normal.leading = 14

#     story = []

#     # Split on double newlines to preserve paragraph spacing
#     for block in text.split("\n\n"):
#         block = block.strip()
#         if not block:
#             continue

#         story.append(
#             Paragraph(
#                 block.replace("\n", "<br/>"),
#                 normal,
#             )
#         )
#         story.append(Spacer(1, 0.2 * inch))

#     doc.build(story)

#     print(f"PDF created at: {desktop_path}")


# if __name__ == "__main__":
#     create_pdf_on_desktop()




# from pathlib import Path


# BASE_DIR = Path(__file__).resolve().parent

# base_path = BASE_DIR / 'backend' / 'financial_statements' / 'Domus_docs'

# pdf_paths = [str(p) for p in base_path.rglob('*') if p.is_file()]

# print(pdf_paths)



# # import datetime

# # from django.core.files.uploadedfile import SimpleUploadedFile

# # from storage.choices_for_models import FileTypeName
# # from processing.choices_for_models import (
# #     ApplicationStatus,
# #     LoanVerdictStatus,
# # )
# # from banking.choices_for_models import (
# #     PaymentInterval,
# # )


# # # Constant default defintions FOR USE IN GLOBAL TESTS

# # ## MODEL DATA

# # TEST_USER_DATA = {
# #     'email': 'def_test83725y3hhgdsy82393@example.com',
# # }

# # TEST_ORGANIZATION_DATA = {
# #     'name': 'Def_example',
# #     'email_domain': 'def_example.com',
# # }

# # TEST_ACCOUNT_DATA = {
# #     'number': '00000000001',
# #     'clabe': '000000000000000001',
# #     'type': 'checking',
# #     # 'name': 'Def_example Sol Checking',
# #     'current_balance': 100,
# # }

# # TEST_CHECKING_ACCOUNT_DATA = {
# #     'debit_card_number': '0000000000000001',
# #     'debit_card_expiration_date': datetime.datetime.today(),
# # }

# # TEST_TRANSACTION_DATA = {
# #     'amount': 150.43,
# # }

# # TEST_LOAN_ACCOUNT_DATA = {
# #     'remaining_balance': 175_000.00,
# #     'paid_balance': 25_000.00,
# #     'payment_type': 'variable',
# #     'payment_amount': 5_000.00,
# #     'payment_interval': PaymentInterval.WEEKLY,
# #     # 'next_payment_date': None,  # auto-calculated with save() method
# # }

# TEST_ACCOUNT_APPLICATION_DATA = {
#     'status': 'X',
#     'type': 'checking',
# }

# TEST_LOAN_ACCOUNT_APPLICATION_DATA = {
#     'annual_revenue_ttm': 10_000_000,
#     'annual_expenses_ttm': 9_000_000,
# }

# # TEST_UPLOADED_FILE = SimpleUploadedFile(
# #     'mod_test.pdf',
# #     b'mod dummy file content',
# #     content_type='application/pdf',
# # )

# # TEST_DOCUMENT_DATA = {
# #     'original_title': 'def_title',  # later check if titles include ext
# #     'file': TEST_UPLOADED_FILE,
# #     'file_type_name': FileTypeName.CASHFLOW_STATEMENT,
# #     'mimetype': 'application/pdf',
# # }

# # TEST_LOAN_VERDICT_AI_DATA = {
# #     'status': LoanVerdictStatus.APPROVED,
# #     'loan_amount': 1_000_000,
# #     'annual_interest_rate': 0.125,
# #     'payment_amount': 76_783.90,
# #     'term_months': 60,
# #     'analysis_summary': """
# #         Decision rationale: The 12-month cash flow for Domus shows consistent positive net cash flow (Total inflows MXN 4,455,000 vs Total outflows MXN 3,220,000; Net cash flow MXN 1,235,000) with an ending cash balance of MXN 1,385,000, indicating ample liquidity to support modest debt service. The combination of solid liquidity, improving cash generation, and a debt service burden within existing cash flow capacity supports approval under these terms, as long as the organization keeps its past track record and maintains it's cashflow position or improves it.
# #     """,
# # }


# ## SERIALIZER DATA

# TEST_SRLZ_ACCOUNT_APPLICATION_DATA = {
#     **TEST_ACCOUNT_APPLICATION_DATA,
#     'loan_account_application': {
#         **TEST_LOAN_ACCOUNT_APPLICATION_DATA,
#     }
# }

# print(TEST_SRLZ_ACCOUNT_APPLICATION_DATA)

# x = {1,2,34,4}
# y = {1,2,4}

# print(x - y)


# # pypdf2 pdf text extraction test

# import PyPDF2
# import textwrap
# import sys

# def extract_text_pypdf2(pdf_path):
#     with open(pdf_path, "rb") as f:
#         reader = PyPDF2.PdfReader(f)

#         full_text = []
#         for i, page in enumerate(reader.pages):
#             text = page.extract_text() or ""
#             full_text.append(f"\n\n===== PAGE {i+1} =====\n")
#             full_text.append(text)

#         return "".join(full_text)


# def pretty_print(text, width=100):
#     for paragraph in text.split("\n"):
#         if paragraph.strip():
#             print(textwrap.fill(paragraph, width=width))
#         else:
#             print()


# if __name__ == "__main__":
#     if len(sys.argv) < 2:
#         print("Usage: python <file_path>.py <pdf_path>")
#         sys.exit(1)

#     pdf_path = sys.argv[1]
#     raw_text = extract_text_pypdf2(pdf_path)
#     pretty_print(raw_text)




# from datetime import datetime, timedelta
# from dateutil.relativedelta import relativedelta

# def get_next_payment_date_from_interval(interval: str):
#     today = datetime.now().date()

#     if interval == 'daily':
#         return today + timedelta(days=1)
#     if interval == 'weekly':
#         return today + timedelta(weeks=1)
#     if interval == 'monthly':
#         return today + relativedelta(months=1)
#     if interval == 'quarterly':
#         return today + relativedelta(months=3)
#     if interval == 'yearly':
#         return today + relativedelta(years=1)

#     return today  # fallback


# print(get_next_payment_date_from_interval('yearly'))
# print(type(get_next_payment_date_from_interval('yearly')))


# from datetime import datetime
# import calendar

# today = datetime.now()

# # Step 1: Add 6 years
# future = today.replace(year=today.year + 6)

# # Step 2: Get last day of the future date's month
# last_day = calendar.monthrange(future.year, future.month)[1]

# # Step 3: Return the date adjusted to the last day of the month
# future_last_day = future.replace(day=last_day)

# print(future_last_day)
# print(type(future_last_day))




# def _get_or_create_organization(user):

#     email = user['email'] or ''

#     email_domain = email.split('@')[-1].strip()

#     name = email_domain.split('.')[0].title()


#     return email_domain, name

# print(_get_or_create_organization({'email': 'black@blackvelvet.com'}))



# class Dog:
#     # CLASS ATTRIBUTE (shared)
#     registry_count = 0

#     def __init__(self, name, age):
#         self.name = name        # instance attribute
#         self.age = age
#         Dog.registry_count += 1 # update class attribute

#     # INSTANCE METHOD (acts on a single dog)
#     def speak(self):
#         return f"{self.name} says: Woof!"

#     # CLASS METHOD (alternative constructors)
#     @classmethod
#     def from_puppy(cls, name):
#         """Create a default young dog"""
#         return cls(name, age=1)

#     @classmethod
#     def unnamed_rescue(cls):
#         """Create a special rescue dog with auto-generated name"""
#         num = cls.registry_count + 1
#         return cls(f"RescueDog{num}", age=2)

#     # STATIC METHOD (general helper)
#     @staticmethod
#     def is_valid_name(name):
#         """Check name rules; doesn't need self or class."""
#         return name.isalpha() and len(name) <= 20



# d = Dog('Max', 4)
# print(d.name)
# print(d.speak())
# d2 = Dog.unnamed_rescue()
# print(d2.name, d2.age)


# # trying to remember OOP w/inheritance

# class Animal:

#     def __init__(self):
#         self.cell_type = 'Eukaryote'
#         self.multi_celled = True
#         self.movement = 'Free'

#     def type(self):
#         return 'Vertebrae, Invertebrae, Insects.'


# class Horse(Animal):

#     def __init__(self, name):
#         self.animal = Animal()
#         self.sound = 'whinny'
#         self.name = name

#     def type(self):
#         return 'Vertebrae.'



# h = Horse('Shadowfax')
# print(h.sound)
# print(h.animal.cell_type)
# print(h.animal.multi_celled)
# print(h.name)
# print(h.animal.type())
# print(h.type())

# # class Person:
# #     def __init__(self):
# #         self._age = 0

# #     @property
# #     def age(self):
# #         return self._age

# #     @age.setter
# #     def age(self, value):
# #         if value < 0:
# #             raise ValueError("no")
# #         self._age = value

# # p = Person
# # print(p)
