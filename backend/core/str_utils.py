import pprint
from typing import Any

from banking.constants import ACCOUNT_NUMBER_LENGTH


def clean_account_name(
    company_name: str = None,
    type_name: str = None,
) -> str:
    """Returns a clean name based on input values."""

    if not type_name:
        raise ValueError('type_name is required.')

    elif company_name and type_name:
        return f'{company_name} - Sol {type_name}'.title()

    elif type_name:
        return f'Sol {type_name}'.title()


def create_account_number(pk) -> str:
    pk_len = len(str(pk))
    zero_prefix_len = ACCOUNT_NUMBER_LENGTH - pk_len
    return '0'*zero_prefix_len + str(pk)


def pretty_print(obj: Any) -> str:
    return pprint.pformat(obj, indent=2, width=80, sort_dicts=True)
