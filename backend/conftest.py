"""
Shared pytest fixtures for the backend.

Applies to every test file under `backend/`, since pytest picks up the nearest
conftest.py automatically.
"""

import pytest


@pytest.fixture(autouse=True)
def celery_runs_inline():
    """
    Run Celery tasks immediately instead of queueing them.

    Tests have no Redis and no worker, so a real `.delay()` would either hang trying to
    reach a broker or silently queue work that nothing ever executes. "Eager" mode makes
    `.delay()` call the function directly, in-process, so tests stay synchronous and
    deterministic.

    `eager_propagates` re-raises exceptions from inside a task instead of stashing them
    on a result object — without it a task that blew up would look like it passed.

    NOTE: this alone does not make queued tasks run. The upload endpoint queues via
    `transaction.on_commit`, and pytest-django wraps each test in a transaction it rolls
    back, so those callbacks never fire. A test that needs the task to actually run must
    use the `django_capture_on_commit_callbacks(execute=True)` fixture — see
    storage/tests/tasks/test_process_upload_document.py.
    """
    from app.celery import app as celery_app

    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    yield
