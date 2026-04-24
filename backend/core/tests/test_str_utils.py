from core.str_utils import (
    clean_account_name,
)

from django.test import SimpleTestCase


class TestStrUtils(SimpleTestCase):
    """ Test str_utils.py file. """

    inputs = {
        'organization_name': 'def organization',
        'type_name': 'checking',
    }

    # test organization_name and type_name included
    def test_organization_and_type_name_success(self):
        clean_name = clean_account_name(**self.inputs)
        self.assertEqual(
            clean_name,
            f'''{self.inputs['organization_name']} - Sol {self.inputs['type_name']}'''.title()
        )

    # test no type_name raises error
    def test_no_type_name_error(self):
        inputs_copy = self.inputs.copy()
        inputs_copy.pop('type_name')
        with self.assertRaises(ValueError):
            clean_account_name(**inputs_copy)

    # test no organization_name returns type_name only in str
    def test_no_organization_success(self):
        inputs_copy = self.inputs.copy()
        inputs_copy.pop('organization_name')
        clean_name = clean_account_name(**inputs_copy)
        self.assertEqual(
            clean_name,
            f'''Sol {inputs_copy['type_name']}'''.title()
        )
