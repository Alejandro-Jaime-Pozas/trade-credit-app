# Implementation Log — gpt_image_upload_support — 2026-07-30

Fixed `openai.BadRequestError` when uploading `.png`/`.jpg`/`.jpeg` files: images now upload to
OpenAI with `purpose='vision'` and are sent to the Responses API as `input_image` parts, instead
of being force-fit into the document-only `input_file`/`purpose='user_data'` path.

## Files changed

### `backend/core/constants.py`
- Added `IMAGE_FILE_EXTENSIONS = ['jpg', 'jpeg', 'png']` — the subset of
  `ALLOWED_FILE_EXTENSIONS` OpenAI treats as images rather than "context stuffing" documents.

### `backend/integrations/openai/services/gpt.py`
- Added `import os` and imported `IMAGE_FILE_EXTENSIONS`.
- New `GPTService.is_image_file(file_path)` — extension check (case-insensitive).
- `upload_file`: now uploads with `purpose='vision'` for images, `purpose='user_data'`
  otherwise (unchanged for non-images).
- New `GPTService.prep_file_for_request(uploaded_file)`: returns
  `{"type": "input_image", "file_id": ..., "detail": "auto"}` when
  `uploaded_file.purpose == 'vision'`, else `{"type": "input_file", "file_id": ...}` — keyed off
  the `purpose` the OpenAI `FileObject` already carries, so no extra state needs threading
  through the call sites.
- `prep_files_for_request` (multi-file loan-verdict flow) now delegates per-file to
  `prep_file_for_request`.
- `get_gpt_file_type_name` and `get_gpt_file_data` (previously each hardcoded a single
  `input_file` content part) now call `prep_file_for_request(uploaded_file)` too.

### `backend/integrations/openai/tests/test_image_uploads.py` (new)
- pytest-style tests (function-based, mocking `OpenAI` the same way the existing
  `test_loan_analyzer.py` does): `is_image_file` extension matrix (case-insensitive; pdf/csv are
  not images), `upload_file` purpose selection (vision vs user_data), and
  `prep_file_for_request` content-part shape for both purposes.

## Verification
1. **Live OpenAI sanity check** (sandboxed, tiny 1x1 PNG + `gpt-5-nano`, not part of the test
   suite): confirmed `files.create(purpose='vision', expires_after=...)` succeeds, and
   `responses.create(..., input_image with file_id...)` returns a real completion — validates
   the approach against the actual API contract before writing it into the codebase.
2. **New tests:** `docker compose exec backend pytest integrations/openai/tests/test_image_uploads.py -v`
   → **10 passed**.
3. **No regressions:** `docker compose exec backend pytest --continue-on-collection-errors -q`
   → **62 passed, 6 skipped** (was 52 passed, 6 skipped before this change — 62 = 52 + 10 new).

## Notes
- `ALLOWED_FILE_EXTENSIONS` already included `jpg`/`jpeg`/`png`, so no Django/serializer/frontend
  change was needed — the upload UI already accepted these files; they just failed downstream at
  the OpenAI call.
- No model/migration changes.
