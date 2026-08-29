# Prompt — OpenAI retry window and connection-failure logging

Date: 2026-08-21

> check out why the openai requests failed if possible in this context i pasted below..i
> uploaded 11 files on first time, none had a successful api run to openai, then i tried
> again and it did work:
>
> [~700 lines of `docker compose` output pasted: backend, celery-worker, postgres, redis.
> The relevant fragment was a single OpenAI 400 on the second, successful batch —
> `BadRequestError("Error code: 400 - {'error': {'message': 'Error while downloading
> file.', 'type': 'invalid_request_error', 'param': 'url', 'code': 'invalid_value'}}")` —
> retried and succeeded. The first, wholly failed batch was NOT in the paste.]

Follow-up, after the diagnosis was delivered with two suggested fixes:

> yes apply those changes

Follow-up, interrupting mid-implementation:

> wait, instead of 30secs do 15 first
