# Prompt Log — gpt_image_upload_support — 2026-07-30

## User prompt

> "we need to allow .png and other image file types to also be uploaded in our process to gpt
> for analysis, is that possible?"

Pasted alongside a production traceback:

```
openai.BadRequestError: Error code: 400 - {'error': {'message': 'Invalid input: Expected
context stuffing file type to be a supported format: ... but got .png.', ...}}
```
from `GPTService.get_gpt_file_type_name` → `client.responses.create(...)`, triggered by
`storage/views.py` → `handle_upload_document_created` → `run_gpt_file_data_extraction`.

## Root cause
`.png`/`.jpg`/`.jpeg` were already in `ALLOWED_FILE_EXTENSIONS` (Django-level upload
validation), but every file — image or document — was uploaded to OpenAI's Files API with
`purpose='user_data'` and sent to the Responses API as `{"type": "input_file", ...}`. That
purpose only supports OpenAI's "context stuffing" text/document formats (pdf, docx, csv, etc.)
— images aren't in that list and get rejected with a 400.
