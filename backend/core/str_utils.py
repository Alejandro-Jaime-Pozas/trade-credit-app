import pprint
from typing import Any


def clean_account_name(
    organization_name: str = None,
    type_name: str = None,
) -> str:
    """Returns a clean name based on input values."""

    if not type_name:
        raise ValueError('type_name is required.')

    elif organization_name and type_name:
        return f'{organization_name} - Sol {type_name}'.title()

    elif type_name:
        return f'Sol {type_name}'.title()


def pretty_print(obj: Any) -> str:
    return pprint.pformat(obj, indent=2, width=80, sort_dicts=True)
