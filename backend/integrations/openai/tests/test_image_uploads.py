"""
Tests for image-file handling in GPTService: images (.png/.jpg/.jpeg) can't use
openai's purpose='user_data' + input_file "context stuffing" path (docs/text only),
so they must be uploaded with purpose='vision' and sent as input_image.
"""
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from integrations.openai.services.gpt import GPTService


PATCH_OPENAI = 'integrations.openai.services.gpt.OpenAI'


@pytest.fixture
def analyzer():
    with patch(PATCH_OPENAI, autospec=True) as mock_openai_class:
        mock_client = Mock()
        mock_openai_class.return_value = mock_client
        yield GPTService(credit_case=Mock())


@pytest.mark.parametrize('file_path,expected', [
    ('/tmp/statement.pdf', False),
    ('/tmp/receipt.PNG', True),
    ('/tmp/receipt.png', True),
    ('/tmp/scan.jpg', True),
    ('/tmp/scan.JPEG', True),
    ('/tmp/data.csv', False),
])
def test_is_image_file(analyzer, file_path, expected):
    assert analyzer.is_image_file(file_path) is expected


def test_upload_file_uses_vision_purpose_for_images(analyzer, tmp_path):
    file_path = tmp_path / 'photo.png'
    file_path.write_bytes(b'fake png bytes')
    analyzer.client.files.create = Mock(return_value=SimpleNamespace(id='file-1', purpose='vision'))

    analyzer.upload_file(str(file_path))

    _, kwargs = analyzer.client.files.create.call_args
    assert kwargs['purpose'] == 'vision'


def test_upload_file_uses_user_data_purpose_for_documents(analyzer, tmp_path):
    file_path = tmp_path / 'doc.pdf'
    file_path.write_bytes(b'fake pdf bytes')
    analyzer.client.files.create = Mock(return_value=SimpleNamespace(id='file-1', purpose='user_data'))

    analyzer.upload_file(str(file_path))

    _, kwargs = analyzer.client.files.create.call_args
    assert kwargs['purpose'] == 'user_data'


def test_prep_file_for_request_builds_input_image_for_vision_files(analyzer):
    uploaded_file = SimpleNamespace(id='file-abc', purpose='vision')

    part = analyzer.prep_file_for_request(uploaded_file)

    assert part == {'type': 'input_image', 'file_id': 'file-abc', 'detail': 'auto'}


def test_prep_file_for_request_builds_input_file_for_documents(analyzer):
    uploaded_file = SimpleNamespace(id='file-abc', purpose='user_data')

    part = analyzer.prep_file_for_request(uploaded_file)

    assert part == {'type': 'input_file', 'file_id': 'file-abc'}
