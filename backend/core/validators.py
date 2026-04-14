from django.core.exceptions import ValidationError

from .constants import FILE_UPLOAD_MAX_SIZE_MB

def validate_file_size(file):  # this is how validators work under the hood, django passes in the actual field content to validate..for a char field, its text, for int field, its num
    max_size_mb = FILE_UPLOAD_MAX_SIZE_MB
    max_size = max_size_mb * 1024 * 1024

    if file.size > max_size:
        raise ValidationError(
            f"File is too large: {file.size/(1024 * 1024)} MB. Max size is {max_size_mb} MB."
        )
