"""
Guards the OpenAI facts documented in `.claude/skills/openai-api/`.

That skill is reference material an engineer (or Claude) reads INSTEAD of re-checking the
SDK every time. Reference material that silently goes stale is worse than none, because it
is trusted. These tests assert the specific SDK behaviours the skill documents, so a
version bump that changes any of them fails here with a pointer to the file to update.

Nothing here calls OpenAI. Every assertion is local introspection of the installed
package, so the suite stays offline and free.
"""

import re
from pathlib import Path

import openai
import pytest
from openai._base_client import BaseClient


#: The SDK version `.claude/skills/openai-api/` was written and verified against.
#: Bump this ONLY after re-reading that skill's reference files against the new SDK.
SKILL_DOC_VERSION = '2.8.1'

SKILL_DIR = '.claude/skills/openai-api/'

REQUIREMENTS = Path(__file__).resolve().parents[3] / 'requirements.txt'


def pinned_requirements_version():
    """The version `requirements.txt` pins, so docs can be checked against the pin."""
    text = REQUIREMENTS.read_text()
    match = re.search(r'^openai==(.+)$', text, re.MULTILINE)
    assert match, f'No pinned `openai==` line found in {REQUIREMENTS}'
    return match.group(1).strip()


def test_requirements_pin_matches_the_documented_version():
    """
    The pin moved without the docs being re-verified.

    This is the drift alarm the whole file exists for: bumping the SDK in requirements.txt
    is exactly the moment someone must re-read the skill.
    """
    assert pinned_requirements_version() == SKILL_DOC_VERSION, (
        f'requirements.txt now pins openai=={pinned_requirements_version()}, but '
        f'{SKILL_DIR} was verified against {SKILL_DOC_VERSION}. Re-verify that skill '
        f'against the new SDK, then update SKILL_DOC_VERSION here.'
    )


def test_installed_sdk_matches_the_pin():
    """The container drifted from requirements.txt — rebuild it before trusting a test run."""
    assert openai.__version__ == pinned_requirements_version()


def test_file_purposes_still_include_the_two_this_repo_uses():
    """
    `GPTService.upload_file` picks between exactly these two. If either is renamed or
    dropped, every upload breaks.
    """
    import typing
    from openai.types import FilePurpose

    purposes = set(typing.get_args(FilePurpose))
    assert {'vision', 'user_data'} <= purposes, (
        f'FilePurpose no longer offers vision/user_data: {sorted(purposes)}. '
        f'Update {SKILL_DIR}references/files.md and GPTService.upload_file.'
    )


def test_exception_hierarchy_that_the_retry_policy_depends_on():
    """
    `storage/tasks.py` retries on `openai.APIError`. Which exceptions that actually
    covers is a load-bearing detail — it is why 400s and connection failures are both
    retried, and why our own bugs are not.
    """
    # Retried by process_upload_document, because all of these are APIError subclasses.
    for exc in (
        openai.BadRequestError,        # 400 — incl. the transient "Error while downloading file."
        openai.RateLimitError,         # 429
        openai.InternalServerError,    # 5xx
        openai.APIConnectionError,     # no response at all
        openai.APITimeoutError,        # subclass of APIConnectionError
        openai.AuthenticationError,    # 401 — retried too; a bad key burns the budget
    ):
        assert issubclass(exc, openai.APIError), (
            f'{exc.__name__} is no longer an APIError, so storage/tasks.py has silently '
            f'stopped retrying it. Update {SKILL_DIR}references/errors.md.'
        )

    # NOT retried: sibling of APIError, not a subclass.
    assert not issubclass(openai.LengthFinishReasonError, openai.APIError)


def test_sdk_does_not_retry_400_internally():
    """
    The skill states the SDK's own retry layer covers 408/409/429/5xx but NOT 400 — which
    is why a `BadRequestError` reaches our code after one attempt while a 429 arrives only
    after three. Asserted by reading the SDK's own retry predicate.
    """
    source = pytest.importorskip('inspect').getsource(BaseClient._should_retry)

    for retried in ('408', '409', '429', '>= 500'):
        assert retried in source, (
            f'SDK retry policy no longer mentions {retried}; '
            f'update {SKILL_DIR}references/errors.md.'
        )
    assert 'x-should-retry' in source


def test_default_internal_retry_count():
    """Nested inside Celery's retries; the skill documents both layers."""
    assert openai.DEFAULT_MAX_RETRIES == 2


def test_input_image_requires_detail_but_input_file_does_not():
    """
    The asymmetry that `GPTService.prep_file_for_request` encodes: images need `detail`,
    documents have no such key.
    """
    from openai.types.responses import (
        ResponseInputFileParam,
        ResponseInputImageParam,
    )

    assert 'detail' in ResponseInputImageParam.__annotations__
    assert 'Required' in str(ResponseInputImageParam.__annotations__['detail'])
    assert 'detail' not in ResponseInputFileParam.__annotations__
    # file_id is how this repo references uploads; file_url/file_data are the alternatives.
    assert 'file_id' in ResponseInputFileParam.__annotations__


def test_json_schema_output_format_keys():
    """`GPTService` builds this dict by hand; these are the keys it must supply."""
    from openai.types.responses.response_format_text_json_schema_config_param import (
        ResponseFormatTextJSONSchemaConfigParam,
    )

    keys = ResponseFormatTextJSONSchemaConfigParam.__annotations__
    for required in ('type', 'name', 'schema'):
        assert required in keys
    assert 'strict' in keys


def test_expires_after_shape_used_on_upload():
    """`upload_file` passes {'anchor': 'created_at', 'seconds': ...}."""
    from openai.types.file_create_params import ExpiresAfter

    assert set(ExpiresAfter.__annotations__) == {'anchor', 'seconds'}
    assert "'created_at'" in str(ExpiresAfter.__annotations__['anchor'])
