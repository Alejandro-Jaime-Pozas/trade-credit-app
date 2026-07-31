# Plan Log — gpt_image_upload_support — 2026-07-30

## Investigation
- `backend/integrations/openai/services/gpt.py`: `upload_file` always uploads with
  `purpose='user_data'`; `get_gpt_file_type_name`/`get_gpt_file_data` always build a single
  `{"type": "input_file", "file_id": ...}` content part; `prep_files_for_request` (used by the
  multi-file loan-verdict flow) does the same for every file.
- `core/constants.py`: `ALLOWED_FILE_EXTENSIONS` already includes `jpg`, `jpeg`, `png` — the
  Django/serializer layer already accepts image uploads; the failure is entirely on the OpenAI
  request-building side.
- Confirmed live against the real OpenAI API (sandboxed, cheap 1x1 PNG + `gpt-5-nano` call):
  - `client.files.create(file=..., purpose='vision', expires_after=...)` succeeds (same
    `expires_after` shape works for `vision` as for `user_data`).
  - `client.responses.create(..., input=[{"role": "user", "content": [{"type": "input_text", ...},
    {"type": "input_image", "file_id": <vision file id>, "detail": "auto"}]}])` succeeds and
    returns a real model response.
  - `openai.types.responses.response_input_image_param.ResponseInputImageParam` confirms
    `input_image` accepts `file_id` (required `detail: low|high|auto`).

## Approach
1. Add `IMAGE_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png']` to `core/constants.py` (subset of
   `ALLOWED_FILE_EXTENSIONS` that OpenAI treats as images, not "context stuffing" documents).
2. `GPTService.is_image_file(file_path)` — extension check.
3. `GPTService.upload_file` — pick `purpose='vision'` for images, `purpose='user_data'`
   otherwise (previous behavior unchanged for non-images).
4. `GPTService.prep_file_for_request(uploaded_file)` — new single-file helper: returns
   `input_image` (with `detail: 'auto'`) if `uploaded_file.purpose == 'vision'`, else
   `input_file`, keyed off the `FileObject.purpose` OpenAI already returns (no extra state to
   thread through).
5. Reuse `prep_file_for_request` in all three call sites that were hardcoding `input_file`:
   `get_gpt_file_type_name`, `get_gpt_file_data`, and `prep_files_for_request` (loan-verdict
   multi-file flow).
6. Add unit tests mocking the OpenAI client (`integrations/openai/tests/test_image_uploads.py`):
   extension detection, purpose selection on upload, and content-part shape for both vision and
   document files.

## Out of scope
- No change to `ALLOWED_FILE_EXTENSIONS` (images were already allowed at the Django layer).
- No frontend change — the upload UI already accepts these extensions per existing constants.
- No change to the CSF/other pydantic extraction schemas.
