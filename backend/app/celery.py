"""
Celery application — the object that knows how to queue and run background jobs.

Background: some work is too slow to do while an HTTP request waits. Classifying an
uploaded document takes three OpenAI round trips (10-30s), and doing that inline meant
the browser waited, and — because ATOMIC_REQUESTS wraps every request in a database
transaction — a Postgres connection sat open the whole time waiting on a third party.

The split is: the web container saves the row and pushes a small message onto a queue
(Redis), then answers immediately. This Celery app is what turns a normal Python function
into something that can be named in such a message, and what the separate worker
container runs in a loop to pull those messages back off and execute them.

There is nothing to call in here. It exists to be imported once at startup by
`app/__init__.py`, which is what makes `@shared_task` functions discoverable.
"""

import os

from celery import Celery


# The worker starts as a bare Python process, not through manage.py, so it needs to be
# told which settings module to use exactly like manage.py does.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')

app = Celery('app')

# Read configuration from Django settings, using only names prefixed with CELERY_ (so
# `CELERY_BROKER_URL` in settings.py becomes Celery's own `broker_url`). Keeping the
# config in settings.py means there is one place to look, next to DATABASES and the rest.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Find every tasks.py in every installed Django app automatically, so a new task file
# never has to be registered anywhere by hand.
app.autodiscover_tasks()
