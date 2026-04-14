from datetime import date
import json
from django.conf import settings

from openai import OpenAI
from openai.types.file_object import FileObject

from core.constants import FILE_TYPE_NAME_MAPPING_PYDANTIC
from storage.models import UploadDocument
from integrations.openai.prompts.extract_file_data import (
    EXTRACT_FILE_TYPE_NAME,
    get_file_data_prompt,
)
# from processing.serializers import LoanVerdictAISerializer
from integrations.openai.error_handling import (
    check_if_output_in_response_output_list,
    handle_get_json_data,
    handle_response_has_no_attr_output_text,
    handle_response_status_incomplete,
    log_gpt_response,
)
from integrations.openai.constants import (
    GPT_MODEL_VERSION,
    MAX_OUTPUT_TOKENS,
)
from integrations.openai.prompts.create_loan import (
    ANALYZE_APPROVE_AND_CREATE_LOAN,
)
from processing.models import (
    AccountApplication,
    LoanVerdictAI,
)
from .pydantic_models.file_type_models import (
    FileTypeNamePydantic,
)
from .pydantic_models.loan_verdict_models import (
    LoanVerdictAIPydantic
)


FILE_TYPE_NAME_SCHEMA = FileTypeNamePydantic.model_json_schema()
LOAN_DETAILS_SCHEMA = LoanVerdictAIPydantic.model_json_schema()


class GPTService:
    """
    Service that connects to openai gpt api to make requests such as
    specific prompts, uploading files, deleting files.
    """

    # Conncect to OpenAI API via api key
    def __init__(self, account_application='a'):
        # TODO later create global openai client, since more efficient
        self.client = OpenAI()  # defaults to system env var OPENAI_API_KEY's value
        self.account_application = account_application

    # Upload a specific file to openai api
    def upload_file(self, file_path: str):
        """ Upload a single file to openai api. """
        with open(file_path, 'rb') as f:
            file = self.client.files.create(
                file=f,
                purpose='user_data',
                expires_after={'anchor': 'created_at', 'seconds': 2592000},
            )

        return file  # contains an id field

    # Upload multiple files to openai api
    def upload_files(self, file_paths_list: list[str]):
        """ Upload multiple files to openai api. """
        uploaded_files = []

        for file_path in file_paths_list:
            file = self.upload_file(file_path)
            uploaded_files.append(file)

        return uploaded_files

    # Create json input-ready list with dict to include in gpt request
    def prep_files_for_request(self, uploaded_files):
        prepped_files = [
            {"type": "input_file", "file_id": f.id} for f in uploaded_files
        ]

        return prepped_files

    # Create inputs for django model JSONField objects
    def prep_json_for_request(self, json_objects: list):
        prepped_json = [
            {"type": "input_text", "text": json_obj} for json_obj in json_objects
        ]

        return prepped_json

    # Prep all inputs for a gpt request
    def prep_all_inputs_for_request(
        self,
        uploaded_files: list,
        json_objects: list,
    ):
        return [
            *self.prep_files_for_request(uploaded_files),
            *self.prep_json_for_request(json_objects)
        ]

    # Delete one file
    def delete_file(self, id):
        """ Delete one file from openai api. """
        res = self.client.files.delete(id)
        return res

    # Delete all files
    def delete_files(self):
        """ Delete files from openai api if no longer required. """
        files = self.client.files.list()

        file_ids = [f.id for f in files.data]

        deleted_files = []
        for file in file_ids:
            res = self.client.files.delete(file)
            deleted_files.append(res)

        return deleted_files  # could later remove this, just check endpoint?

    def json_to_dict(self, response):
        try:
            text = response.output_text
            d = json.loads(text)
            return d
        except Exception as e:
            print(f'Error turning response json into dict: {e}')

    def get_pydantic_model_json_schema(self, file_type_name):
        model = FILE_TYPE_NAME_MAPPING_PYDANTIC.get(file_type_name)
        if model:
            return model.model_json_schema()

    # Request structured json response based on file and prompt input
    def get_gpt_file_type_name(self, uploaded_file: FileObject):
        response = self.client.responses.create(
            model=GPT_MODEL_VERSION,  # can use smarter models later..
            input=[
                {
                    "role": "system",  # use system role for unchanging prompt data feeds
                    "content": [
                        {
                            "type": "input_text",
                            "text": EXTRACT_FILE_TYPE_NAME,
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_file",
                            "file_id": uploaded_file.id,
                        },
                    ]
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "FileTypeNamePydantic",
                    "strict": True,
                    "schema": FILE_TYPE_NAME_SCHEMA,
                },
            },
            max_output_tokens=MAX_OUTPUT_TOKENS,  # hard limit on tokens, if not enough no response
        )

        return response

    # Request structured json response based on file and prompt input
    def get_gpt_file_data(
        self,
        uploaded_file: FileObject,
        file_type_name: str,
    ):
        response = self.client.responses.create(
            model=GPT_MODEL_VERSION,  # can use smarter models later..
            input=[
                {
                    "role": "system",  # use system role for unchanging prompt data feeds
                    "content": [
                        {
                            "type": "input_text",
                            "text": get_file_data_prompt(file_type_name),
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_file",
                            "file_id": uploaded_file.id,
                        },
                    ]
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": file_type_name,  # check if name even matters what you put in
                    "strict": True,
                    "schema": self.get_pydantic_model_json_schema(file_type_name),
                },
            },
            max_output_tokens=MAX_OUTPUT_TOKENS,  # hard limit on tokens, if not enough no response
        )

        return response

    # Run gpt file_type_name and file data extraction process
    def run_gpt_file_data_extraction(self, doc: UploadDocument):  # TODO change to allow many docs, so user uploads/creates docs in one go, and this processes all of them
        """
        Service that:
            1. Connects to openai api
            2. Uploads file to openai api
            3. Requests structured json response based on file and prompt input
            4. Validates the json response based on pydantic json schema
            5. Updates the validated data into existing UploadDocument db object
            6. Deletes uploaded files to prevent storage buildup limits
         """

        # Upload the new doc to gpt files endpoint for analysis
        uploaded_file = self.upload_file(doc.file.path)
        # print('uploaded_file:', uploaded_file)

        # Request file_type_name creation for doc
        res = self.get_gpt_file_type_name(uploaded_file)
        file_type_name_dict = self.json_to_dict(res)
        file_type_name = file_type_name_dict.get('file_type_name')
        # print('file_type_name:', file_type_name)

        if not file_type_name:
            raise KeyError(f'Response should include file_type_name key, but it\'s not present: {res}')

        # Request extracted_data for doc
        res = self.get_gpt_file_data(uploaded_file, file_type_name)
        extracted_data_dict = self.json_to_dict(res)
        # print('extracted_data_dict:', extracted_data_dict)

        # Update the doc's fields with new gpt created fields
        doc.file_type_name = file_type_name
        doc.extracted_data = extracted_data_dict
        doc.save()
        # print('doc.file.name:', doc.file.name)
        # print('doc.file_type_name:', doc.file_type_name)
        # print('doc.extracted_data:', doc.extracted_data)
        # print('missing docs for acct_app:', doc.account_applications.first().missing_file_type_names)

        # Delete gpt uploaded files for proper clean up
        # For some reason, there's a server error that happens often...
        # TODO delete aggregates instead of individually somehow in views.py
        try:
            deleted_file = self.delete_file(uploaded_file.id)
        except Exception as e:
            print(f'Cleanup failed for delete_file function: {e}')

        # Return the updated doc
        return doc


    # Request structured json response based on file and prompt input
    def get_gpt_loan_verdict(
        self,
        uploaded_files: list[str],
        json_objects: list,
    ):
        response = self.client.responses.create(
            model=GPT_MODEL_VERSION,  # can use smarter models later..
            input=[
                {
                    "role": "system",  # use system role for unchanging prompt data feeds
                    "content": [
                        {
                            "type": "input_text",
                            "text": ANALYZE_APPROVE_AND_CREATE_LOAN,
                        },
                    ],
                },
                {
                    "role": "user",
                    "content": self.prep_all_inputs_for_request(
                        uploaded_files=uploaded_files,
                        json_objects=json_objects,
                    )
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "LoanVerdictAIPydantic",
                    "strict": True,
                    "schema": LOAN_DETAILS_SCHEMA,
                },
            },
            max_output_tokens=MAX_OUTPUT_TOKENS,  # hard limit on tokens, if not enough no response
        )

        return response

    # Run gpt loan verdict process
    def run_gpt_loan_verdict(self):
        """
        Service that:
            1. Connects to openai api
            2. Uploads file(s) to openai api
            3. Requests structured json response based on file and prompt input
            4. Validates the json response based on pydantic json schema
                (based on LoanVerdictAI model)
            5. Inserts the validated data into new LoanVerdictAI db object
            6. Deletes uploaded files to prevent storage buildup limits
         """

        # Get the file paths
        acct_app = self.account_application
        docs = acct_app.upload_documents.all()  # TODO later only want to fetch relevant files to get loan verdict, use filter..
        file_paths = [d.file.path for d in docs]

        # Upload the file to openai api
        # TODO implement handling 500/502 errors from gpt api which crashes
        uploaded_files = self.upload_files(file_paths)
        # print('Success!! uploaded files to gpt api:', uploaded_files)

        # Get all json data required for loan verdict (buro de credito data)
        bdc_reports = acct_app.buro_de_credito_reports.all()
        json_objects = [json.dumps(r.json_response) for r in bdc_reports]

        # Request the gpt loan verdict
        # TODO this takes too long so need to create an async version
        response = self.get_gpt_loan_verdict(
            uploaded_files=uploaded_files,
            json_objects=json_objects,
        )
        # print('Success!! response:', response.text)

        # Parse JSON string response into Pydantic model
        self.response_error_handling(response)

        raw_json = response.output_text  # model returns JSON string due to response_format

        self.response_data_handling(response, raw_json)

        data = handle_get_json_data(raw_json)

        # Validate data creating pydantic model
        loan_details = LoanVerdictAIPydantic.model_validate(data)

        # Create dict from pydantic model for serializer input
        payload = loan_details.model_dump()
        loan_acct_app_obj = self.account_application.loan_account_application

        # Insert the validated data into new LoanVerdictAI db object
        loan_verdict_obj = LoanVerdictAI.objects.create(
            loan_account_application=loan_acct_app_obj,
            **payload,  # supposedly already validated by pydantic model
        )

        # Delete gpt uploaded files for proper clean up
        # For some reason, there's a server error that happens often...
        try:
            deleted_files = self.delete_files()  # TODO fix this, instead of deleting all openai files, only the ones used in this process
        except Exception as e:
            print(f'Cleanup failed for delete_files function: {e}')

        return loan_verdict_obj


    def response_error_handling(self, response):
        # Check response status first
        if response.status == 'incomplete':
            handle_response_status_incomplete(response)

        # Check if output_text attribute exists
        if not hasattr(response, 'output_text'):
            handle_response_has_no_attr_output_text(response)


    def response_data_handling(self, response, raw_json):
        # Debug: Print the raw response to understand its structure
        log_gpt_response(response, raw_json)

        # Check if response has attr output to further debug
        if not raw_json or raw_json.strip() == "":
            check_if_output_in_response_output_list(response)


