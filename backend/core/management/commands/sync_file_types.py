"""
Management command that pushes the app's file type catalog into the database.

Run this after adding or renaming an entry in `core/file_type_catalog.py`:

    docker compose exec backend python manage.py sync_file_types

It is safe to run repeatedly — running it twice in a row reports no changes the second
time. New environments get their file types from migration 0009 instead, which calls the
same helper.
"""

from django.core.management.base import BaseCommand

from core.file_type_sync import sync_global_file_types
from storage.models import FileType


class Command(BaseCommand):
    help = 'Create or update the app-provided FileType rows from core/file_type_catalog.py.'

    def handle(self, *args, **options):
        created, updated, unchanged = sync_global_file_types(FileType)

        self.stdout.write(
            f'File types synced: {created} created, {updated} updated, {unchanged} unchanged.'
        )
        if not created and not updated:
            self.stdout.write(self.style.SUCCESS('Already up to date.'))
        else:
            self.stdout.write(self.style.SUCCESS('Done.'))
