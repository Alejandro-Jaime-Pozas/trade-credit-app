
from typing import Iterable


# Automate generating django choices
def build_enum(values: Iterable[str]):

    attrs = {}

    for v in values:
        key = v.upper()
        label = v.replace('_', ' ').title()
        attrs[key] = v, label

    return attrs 
