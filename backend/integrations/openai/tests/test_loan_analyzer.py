from unittest.mock import MagicMock, Mock, mock_open, patch
from django.conf import settings
from django.test import TestCase

from core.tests.constants_global import TEST_LOAN_VERDICT_AI_DATA
from integrations.openai.tests.constants import UPLOAD_FILE_RESPONSE_SAMPLE
from integrations.openai.services import gpt
from integrations.openai.services.gpt import (
    LoanVerdictAIPydantic,
    GPTService,
)

PATCH_MAIN = 'integrations.openai.services.gpt'
PATCH_OPENAI = PATCH_MAIN + '.OpenAI'
PATCH_OPEN_FN = PATCH_MAIN + '.open'


class TestGPTService(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.loan_verdict_data = TEST_LOAN_VERDICT_AI_DATA.copy()

    def setUp(self):
        # Patch OpenAI where it’s imported/used
        self.openai_patcher = patch(PATCH_OPENAI, autospec=True)
        self.mock_openai_class = self.openai_patcher.start()

        self.mock_client = Mock()
        self.mock_openai_class.return_value = self.mock_client

        # create instance of loan analyzer after mocking its init
        self.account_application = Mock()
        self.account_application.id = 1
        self.analyzer = GPTService(self.account_application)

    def tearDown(self):
        self.openai_patcher.stop()

    # test instantiating class mocks OpenAI()
    def test_init_creates_client(self):
        test_analyzer = self.analyzer

        self.mock_openai_class.assert_called_once()
        self.assertIs(test_analyzer.client, self.mock_client)


    # test pydantic model success, schema generated
    def test_pydantic_model_create(self):
        pyd_loan_inst = LoanVerdictAIPydantic(
            **self.loan_verdict_data,
        )
        pyd_data = pyd_loan_inst.model_dump()  # to dict

        json_schema = pyd_loan_inst.model_json_schema()

        self.assertIsInstance(pyd_loan_inst, LoanVerdictAIPydantic)
        self.assertEqual(pyd_data, self.loan_verdict_data)
        self.assertIn('properties', json_schema)


    # test upload pdf file to openai success
    # TODO later replace local files with s3 files
    # TIP: WILL NOT CONTINUE MAKING THESE TYPES OF TESTS, BETTER TO JUST MOCK ENTIRE FUNCTION OUTPUT. MAY EVEN DELETE THIS TEST LATER
    @patch(PATCH_OPEN_FN, new_callable=mock_open, read_data=b'%PDF1.4 fake pdf bytes')
    def test_upload_pdf_file_to_openai_mock(self, mock_file_open):
        # mock file path
        pdf_path = settings.BASE_DIR / 'fake/pdf/path/example.pdf'  # mocked with open/mock_open

        # mock file create api request
        mock_client = self.analyzer.client  # mocked
        mock_client.files.create = MagicMock(return_value=UPLOAD_FILE_RESPONSE_SAMPLE)  # mocked

        # mock uploading file
        with gpt.open(pdf_path, 'rb') as f:  # mocked; import module that contains open
            file = mock_client.files.create(
                file=f,
                purpose='user_data',
                expires_after={'anchor': 'created_at', 'seconds': 2592000}
            )

        mock_file_open.assert_called_once_with(pdf_path, 'rb')
        mock_client.files.create.assert_called_once()
        _, kwargs = mock_client.files.create.call_args
        self.assertEqual(kwargs['purpose'], 'user_data')
        self.assertEqual(kwargs['file'], mock_file_open.return_value)
        self.assertEqual(file['id'], UPLOAD_FILE_RESPONSE_SAMPLE['id'])


    # test pydantic model validation success based on json schema


    # test create LoanVerdictAI db obj success
