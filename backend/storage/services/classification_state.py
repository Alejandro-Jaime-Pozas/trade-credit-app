"""
Working out whether a document is still being classified.

Classification runs in a Celery worker (`storage/tasks.py`), so `POST /upload-documents/`
answers immediately with `file_type_name = null` and the real answer arrives 10-30 seconds
later. The UI needs to tell two very different situations apart:

  - a document queued moments ago, where a spinner is the honest thing to show, and
  - a document whose job never ran or died, where a spinner would be a lie that never ends.

WHY THIS IS DERIVED FROM TIME RATHER THAN ASKED OF CELERY:
A result backend is configured, so the task id could be stored and `AsyncResult(id).status`
read back. That was deliberately not done. Celery answers `PENDING` for a task id it has
never heard of, so "queued" and "lost forever" come back identical — precisely the
distinction being made here. Results also expire (24h by default), after which every older
document would report `PENDING` again, and each row in a list response would cost a Redis
round trip.

Deriving it from `uploaded_at` needs no extra state, survives restarts, and is the same
answer on every page load.
"""

from django.conf import settings
from django.utils import timezone


#: Reported when the classifier has answered — including when its answer was `unknown`,
#: which is the classifier saying "I could not tell", not an absence of a reply.
CLASSIFIED = 'classified'
#: No answer yet, and recent enough that the worker is plausibly still on it.
PROCESSING = 'processing'
#: No answer, and long enough ago that waiting further is not useful. The user should be
#: offered the file type control so they can label the document themselves.
UNCLASSIFIED = 'unclassified'

CLASSIFICATION_STATUSES = (CLASSIFIED, PROCESSING, UNCLASSIFIED)


def classification_status(doc, now=None):
    """
    Where one document stands with the classifier.

    `doc` is an UploadDocument. `now` is injectable so tests can place a document either
    side of the timeout without sleeping.
    """
    if doc.file_type_name:
        return CLASSIFIED

    uploaded_at = doc.uploaded_at
    if uploaded_at is None:
        # Not saved yet (auto_now_add has not run), so nothing has been queued for it.
        return PROCESSING

    now = now or timezone.now()
    elapsed = (now - uploaded_at).total_seconds()

    if elapsed < settings.DOCUMENT_CLASSIFICATION_TIMEOUT_SECONDS:
        return PROCESSING
    return UNCLASSIFIED
