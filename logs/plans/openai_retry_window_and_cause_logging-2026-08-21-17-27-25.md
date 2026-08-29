# Plan — OpenAI retry window and connection-failure logging

Date: 2026-08-21

## Diagnosis first

The pasted log did not contain the failure the user was actually asking about. It showed
the *second*, successful batch. The Docker stack was still running, so the real worker log
was pulled directly (`docker compose logs celery-worker`) rather than reasoning from the
excerpt. That produced two distinct findings:

**1. The lost batch of 11 (22:16 UTC) — a network outage, not an API error.**

```
22:16:10  11 tasks received
22:16:19  Retrying request to /files ...                       ← openai SDK internal retry
22:16:24  retry: Retry in 0s: APIConnectionError('Connection error.')
22:16:38  raised unexpected: OpenAIError('Connection error.')  ← ×11, all dead
22:18:46  next task: POST /v1/files "HTTP/1.1 200 OK"          ← network healthy again
```

Every one failed at `gpt.py:85` (`client.files.create`), before any request reached
OpenAI — no HTTP status, nothing logged on OpenAI's side. Each attempt failed in ~3-8s,
i.e. at connect/DNS level, nowhere near the 120s timeout. The worker had been idle since
21:51 and recovered by 22:18:46, consistent with a short host-side egress blip.

The bug is not the outage; it is that the retry policy could not outlast it.
`retry_backoff=True` means factor 1, so with jitter the attempts waited 0s, 1s, 2s. All
four attempts plus the SDK's own internal retries were spent inside a 28-second window
entirely contained by the outage.

**2. The 400 on the second batch — a genuine, transient OpenAI-side failure.**
The file uploaded fine and returned `status='processed'`; OpenAI's own fetch of it during
`/v1/responses` failed. `BadRequestError` subclasses `openai.APIError`, so the existing
`autoretry_for` caught it, the task re-uploaded under a new file id, and it succeeded.
Working as designed — no change needed.

## Changes

Scoped to `backend/storage/tasks.py`. Both are the fixes the user approved.

1. **`retry_backoff=True` → `retry_backoff=15`.** Attempts land at ~15s / 30s / 60s
   instead of ~0s / 1s / 2s: ~105 seconds of coverage rather than 28.

   The user chose 15 over the 30 originally proposed ("do 15 first"). Worth noting the
   ceiling this must respect either way: the window has to stay under
   `DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS` (300), because past that the UI stops
   showing the document as processing and hands the user a manual file type control. A
   task still retrying after that point could succeed late and overwrite the type the
   user picked by hand. 15 leaves a wide margin (105s); 30 would have been 210s — safe,
   but closer. `max_retries` stays at 3 for the same reason.

2. **Log the underlying cause of an OpenAI failure.** Wrap the
   `handle_upload_document_created` call, log `exc.__cause__`, re-raise unchanged so
   `autoretry_for` still fires. `openai.APIConnectionError` stringifies to just
   "Connection error." — no host, no errno — and Celery's error logging drops the chained
   cause, so the real reason (DNS vs refused vs TLS) never reaches the log. Diagnosing
   this incident required reading the source and inferring from timing; this line would
   have answered it directly.

## Explicitly not changed

- **The global `GPTService.delete_files()`** (`gpt.py:147`), which deletes every file in
  the OpenAI account rather than just this run's. It was checked as a suspect — it would
  produce exactly the observed "Error while downloading file." for in-flight tasks — and
  ruled out: its only caller, `run_gpt_loan_verdict`, is commented out. Still a live
  hazard for whenever that path is switched on, but out of scope here.
- **`decisions.md`.** This is retry tuning and a log line, not a reshaping of app
  architecture, so it does not meet the "fundamental to the app's architecture" bar.

## Tests

Three added to `storage/tests/tasks/test_process_upload_document.py`:
the backoff factor and the resulting window (asserted at both ends — long enough to
outlast a ~2min blip, short enough to stay under the classification timeout); that a
connection failure's underlying cause reaches the log; and that logging it does not
swallow the re-raise, since a swallowed exception would report the task as succeeded and
leave the document silently unclassified forever.
