"""
Order document types by their Spanish name instead of their English one.

The UI now prints `label_es`, so a list sorted by `label_en` looked shuffled to the
reader. State-only: `AlterModelOptions` changes no columns and runs no SQL, it just
tells Django which column to ORDER BY from here on.
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('storage', '0011_filetype_group_filetype_is_default_suggestion'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='creditcaserequirement',
            options={'ordering': ['file_type__label_es']},
        ),
        migrations.AlterModelOptions(
            name='filetype',
            options={'ordering': ['label_es']},
        ),
    ]
