from unittest.mock import Mock
from django.test import SimpleTestCase
from django.core.exceptions import ValidationError

from core.constants import FILE_UPLOAD_MAX_SIZE_MB
from core.validators import (
    validate_file_size,
)


class TestCustomValidators(SimpleTestCase):
    """
    Test all custom validators required for any
    django apps.
    """

    max_size_mb = FILE_UPLOAD_MAX_SIZE_MB

    def test_validate_file_size_success(self):
        file = Mock()
        file.size = (self.max_size_mb - 1) * 1024 * 1024

        validate_file_size(file)

    def test_validate_file_size_error(self):
        file = Mock()
        file.size = (self.max_size_mb + 1) * 1024 * 1024

        with self.assertRaises(ValidationError) as e:
            validate_file_size(file)

        self.assertIn('20', e.exception.message)
