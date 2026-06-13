"""
Build possible months and required months dicts given an account application's
upload document's file_type_name.

This is to check if all files given a file_type_name contain any or all of those
timeframe requirements.
"""

from datetime import date
from dateutil.relativedelta import relativedelta

from core.str_utils import pretty_print
from core.constants import (
    LOAN_FILE_MONTHS_REQUIRED_LEGAL,
    CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED,
    LOAN_FILE_MONTHS_REQUIRED_FINANCIALS,
    MAX_FILE_MONTHS_BACK_FINANCIALS,
    MAX_FILE_MONTHS_BACK_LEGAL,
)
from core.date_utils import (
    get_current_date,
)
# from processing.models import AccountApplication


file_type_names = CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED
months_required_financials = LOAN_FILE_MONTHS_REQUIRED_FINANCIALS
months_required_legal = LOAN_FILE_MONTHS_REQUIRED_LEGAL
all_months_required = months_required_financials | months_required_legal
max_mths_back_financials = MAX_FILE_MONTHS_BACK_FINANCIALS
max_mths_back_legal = MAX_FILE_MONTHS_BACK_LEGAL


def build_possible_month_intervals(file_type_name: str):
    """
    Depending on the file_type_name, build the possible date range
    the files must satisfy. Possible here means months that are
    eligible within the specified timeframe (could be a list of 14
    possible dates, of which 12 are later final and required).

    Returns dict.
    """

    # If file_type_name has a month requirement (some won't like Acta Constitutiva)
    if file_type_name in all_months_required:

        # Use months required and min start/end dates to build possible month(s) given the file_type_name
        if file_type_name in months_required_financials:
            possible_months = months_required_financials[file_type_name] + max_mths_back_financials - 1
        elif file_type_name in months_required_legal:
            possible_months = months_required_legal[file_type_name] + max_mths_back_financials

        if not possible_months:
            raise ValueError(f'file_type_name {file_type_name} not found in months_required dicts.')

        current_date = get_current_date()
        start_month_date = current_date - relativedelta(months=possible_months)

        months_dict = {}
        d = start_month_date
        while d <= current_date:
            months_dict[d] = False
            d += relativedelta(months=1)

        return months_dict

    else:
        raise ValueError(
            f"'{file_type_name}' is not a valid value, must be one of: " \
            f"\n\t{pretty_print(file_type_names)}"
        )


def build_aggregate_possible_month_intervals(file_type_names: set):
    """
    Returns an aggregate dict of dictionaries, one for each required
    loan file type name depending on possible month intervals required
    to satisfy that file's requirements.

    All values set to false initially.
    """

    all_files_possible_months = {}
    for name in file_type_names:
        all_files_possible_months[name] = build_possible_month_intervals(name)

    return all_files_possible_months


def check_satisfied_month_intervals(
    acct_app,  # AccountApplication
    file_type_name: str,
):
    """
    Returns a dict with the possible month intervals for a specific
    file_type_name, and checks if those values are true or false.
    """

    # Filter all of the acct_app's upload_docs given a file_type_name
    docs = acct_app.upload_documents.filter(file_type_name=file_type_name)
    if not docs:
        return {}

    # Get the possible month intervals for the file_type_name
    verified_months = build_possible_month_intervals(file_type_name)  # dict w/1+ month invervals which all equal False

    # For each filtered doc, check start/end dates, set all values between start and end per file as True in verified_months dict
    for doc in docs:
        data = doc.extracted_data
        if data:
            start = data.get('date_range_start')
            end = data.get('date_range_end')

            # If start and end, set those months (and months in between) to true in verfied_months, if they're included in verified_months options
            if start and end:
                start = date.fromisoformat(start) - relativedelta(day=1)
                end = date.fromisoformat(end) - relativedelta(day=1)

                month_intervals = set()
                cur = start
                while cur <= end:
                    month_intervals.add(cur)
                    cur += relativedelta(months=1)

                # For each key in verified_months, check if it's in the month_intervals, or the other way around...
                verified_months_keys = verified_months.keys()
                for month in verified_months_keys:
                    if month in month_intervals:
                        verified_months[month] = True

    return verified_months


def check_aggregate_satisfied_month_intervals(
    acct_app,  # AccountApplication
    file_type_names: set,
) -> dict:
    """
    Returns a dict of all months for which all of an AccountApplication's
    required UploadDocument objects have been uploaded by a user.
    """

    acct_app_docs_verified_months = {}

    for name in file_type_names:
        acct_app_docs_verified_months[name] = check_satisfied_month_intervals(
            acct_app=acct_app,
            file_type_name=name,
        )

    return acct_app_docs_verified_months


def check_file_required_dates_complete(
    acct_app,  # AccountApplication
    file_type_name: str,
):
    """
    Check if an AccountApplication's date/month requirements for a
    specific UploadDocument file_type_name have been satisfied.

    Returns bool.
    """

    # Get a specific file_type_name's satisfied dates
    doc_satisfied_months = check_satisfied_month_intervals(
        acct_app=acct_app,
        file_type_name=file_type_name,
    )

    # Check if all required dates satisfied
    count = 0
    required = months_required_financials.get(file_type_name) or \
        months_required_legal.get(file_type_name)

    if not required:
        raise ValueError(f'required must have a value, none found in months_required dicts for file_type_name: {file_type_name}')

    for value in doc_satisfied_months.values():
        if value == False:
            count = 0
        elif value == True:
            count += 1
        if count == required:
            # File date requirements are satisfied, mark as complete
            return True

    return False


def check_all_files_required_dates_complete(
    acct_app,  # AccountApplication
        file_type_names: set,
):
    """
    Check if an AccountApplication's date/month requirements for all
    UploadDocument file_type_names have been satisfied.

    Returns bool.
    """

    all_file_types = {}

    # Check which files are complete
    for name in file_type_names:
        doc_is_complete = check_file_required_dates_complete(
            acct_app=acct_app,
            file_type_name=name,
        )

        all_file_types[name] = doc_is_complete

    # If any doc is missing, return false, else true and all files complete
    if False in all_file_types.values():
        return False
    else:
        return True
