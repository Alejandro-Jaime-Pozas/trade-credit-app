# Implementation — OpenAI retry window and connection-failure logging

Date: 2026-08-21

Both changes are in `backend/storage/tasks.py`. No other production file changed.

## 1. Retry spacing widened

`retry_backoff=True` (Celery's default factor of 1) → `retry_backoff=15`.

Retries now land at roughly 15s, 30s and 60s — about 105 seconds of coverage — instead of
~0s, 1s, 2s, which gave 28 seconds and was the direct cause of an upload of 11 documents
being lost to a ~2 minute network outage on 2026-08-21.

`max_retries` stays 3 and `retry_jitter` stays on. Jitter matters more here than the
comment previously suggested: a network outage or rate limit hits an entire upload batch
simultaneously, so without it all 11 tasks would retry at the same instant. The comment
was rewritten to say that, and to record why 15 is not larger — the window must stay under
`DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS` (300), past which the UI stops showing the
document as processing and offers a manual file type control that a late-succeeding task
would overwrite.

## 2. The underlying cause of a failure now reaches the log

`handle_upload_document_created(doc)` is now wrapped:

```python
try:
    return handle_upload_document_created(doc)
except openai.APIError as exc:
    logger.warning(
        'OpenAI call failed for UploadDocument id=%s: %r (underlying cause: %r); '
        'retry %s of %s.',
        upload_document_id, exc, exc.__cause__,
        self.request.retries, self.max_retries,
    )
    raise
```

`openai.APIConnectionError` stringifies to just "Connection error." — no host, no errno,
nothing separating a DNS failure from a refused connection from an expired certificate.
The real reason lives on `__cause__` (the underlying httpx exception) and Celery's error
logging does not print chained causes, so it was being lost entirely.

`raise` re-raises the original exception unchanged, so `autoretry_for=(openai.APIError,)`
still sees it and the traceback is preserved. Catching `openai.APIError` (not
`Exception`) keeps the existing contract intact: our own bugs still surface immediately
and unlogged-over, exactly as `test_our_own_bugs_are_not_retried` requires.

## Tests

Three added to `storage/tests/tasks/test_process_upload_document.py`:

- `test_retry_backoff_outlasts_a_short_network_outage` — asserts the factor and the
  resulting window at BOTH ends: ≥100s so it outlasts a blip of the length actually
  observed, and `< DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS` so a retry can never outlive
  the UI's patience and overwrite a manually chosen file type.
- `test_connection_failure_logs_its_underlying_cause` — an `APIConnectionError` carrying a
  `ConnectionRefusedError` cause must put both the cause and the document id in the log.
- `test_logging_the_cause_does_not_swallow_the_retry` — guards the `raise`. Had it been
  dropped, the task would report success and the document would silently never be
  classified.

Result: 8 passed in that file; full backend suite 225 passed, 6 skipped.

## Not fixed (noted for later)

`GPTService.delete_files()` (`integrations/openai/services/gpt.py:147`) deletes every file
in the OpenAI account, not just the ones from its own run. It was investigated as a
suspect for this incident — concurrent deletion produces exactly the "Error while
downloading file." 400 seen on the second batch — and cleared, because its only caller
(`run_gpt_loan_verdict`) is currently commented out. It already carries a TODO. It will
corrupt concurrent classification the moment the loan verdict path is enabled.
