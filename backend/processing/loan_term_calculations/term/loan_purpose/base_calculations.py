""" Calculations for loan purpose. """


from processing.loan_term_calculations.constants import LOAN_PURPOSE_MAPPING


def get_loan_purpose_max_term(
    loan_purpose: str,
    loan_purpose_map: dict = LOAN_PURPOSE_MAPPING
):
    """ Given a loan purpose, get its max term in months. """

    return loan_purpose_map[loan_purpose]['max']
