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
    # Wait longer between attempts (~1s, 2s, 4s) rather than hammering a service that
    # has just asked us to slow down. Jitter spreads retries out when many documents
    # were rate-limited at the same moment.
    retry_backoff=True,
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

    return handle_upload_document_created(doc)
