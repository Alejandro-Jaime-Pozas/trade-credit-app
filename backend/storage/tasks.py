"""
Background jobs for uploaded documents.

These run in the `celery-worker` container, not in the web request. The upload endpoint
saves the row, queues the job, and answers straight away; a worker picks the job up and
does the slow part (asking OpenAI what the document is and pulling data out of it).
"""

import logging

import openai
from celery import shared_task

from .models import UploadDocument
from .services.db_object_handling import handle_upload_document_created


logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    # Retry ONLY on OpenAI-side failures. openai.APIError is the base class for rate
    # limits, timeouts, connection errors and 5xx responses — all things that genuinely
    # succeed on a second attempt. A bug in our own code (a TypeError, say) would fail
    # identically three more times, cost three more API calls, and bury the real
    # traceback, so those are deliberately left to fail once and loudly.
    autoretry_for=(openai.APIError,),
    # Seconds before the FIRST retry; each later one doubles it, so the attempts land at
    # roughly 15s, 30s and 60s (jitter picks a random point up to each of those).
    #
    # This number is deliberately not small. The failure it exists for is not a rate
    # limit but a short network outage: on 2026-08-21 the worker briefly could not reach
    # api.openai.com at all, and an upload of 11 documents lost every single one. The
    # backoff at the time was Celery's default factor of 1 — ~0s, 1s, 2s — so all four
    # attempts, plus the OpenAI SDK's own internal retries, were spent inside a
    # 28-second window while the network was still down. Connectivity returned about two
    # minutes later, by which point every task had already given up.
    #
    # 15 spreads the same three retries over ~105 seconds instead, which covers a blip of
    # that length. It stays under DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS (300) on
    # purpose: a document must not still be retrying after the UI has stopped calling it
    # "in progress" and handed the user the manual file type control, or a late success
    # would overwrite the type they chose themselves.
    retry_backoff=15,
    # Spread the retries out when many documents fail at the same moment — which is the
    # normal case here, since a network outage or rate limit hits a whole upload batch at
    # once and would otherwise send all of them back at the same instant.
    retry_jitter=True,
    max_retries=3,
)
def process_upload_document(self, upload_document_id):
    """
    Classify one uploaded document and extract its data.

    Takes an ID rather than the document itself, for two reasons: a queue message is
    plain JSON and cannot carry a model instance, and by the time a worker picks the job
    up (possibly after a restart) a copy of the row would be stale anyway. Re-fetching
    guarantees the worker sees current data.

    Does the real work through `handle_upload_document_created`, unchanged — this task
    only changes WHEN that runs, not what it does.
    """
    try:
        doc = UploadDocument.objects.get(pk=upload_document_id)
    except UploadDocument.DoesNotExist:
        # Deleted between being queued and being picked up. Normal, not a failure —
        # retrying would never succeed.
        logger.info(
            'UploadDocument id=%s no longer exists; skipping classification.',
            upload_document_id,
        )
        return None

    try:
        return handle_upload_document_created(doc)
    except openai.APIError as exc:
        # Log WHY the call failed, then re-raise unchanged so the autoretry above still
        # sees it and the traceback is not swallowed.
        #
        # This exists because openai.APIConnectionError stringifies to just "Connection
        # error." — no host, no errno, nothing separating a DNS failure from a refused
        # connection from an expired certificate. The real reason lives on __cause__ (the
        # underlying httpx exception), and Celery's own error logging does not print the
        # chained cause, so without this it is lost entirely. Diagnosing the outage of
        # 2026-08-21 meant reading the code and guessing; this line would have answered it.
        logger.warning(
            'OpenAI call failed for UploadDocument id=%s: %r (underlying cause: %r); '
            'retry %s of %s.',
            upload_document_id,
            exc,
            exc.__cause__,
            self.request.retries,
            self.max_retries,
        )
        raise
