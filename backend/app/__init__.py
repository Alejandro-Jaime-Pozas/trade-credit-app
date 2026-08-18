"""
Load the Celery app whenever Django starts.

This import looks unused and is not: it is what makes `@shared_task` functions bind to a
real Celery app. Without it they are never registered, so `.delay()` silently queues jobs
under a name no worker recognises — and nothing errors, the work simply never happens.
"""

from .celery import app as celery_app


__all__ = ('celery_app',)
