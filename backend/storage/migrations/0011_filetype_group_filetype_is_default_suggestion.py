"""
Give FileType its display group and default-suggestion flag, then fill them in.

The two AddFields alone would leave every existing row at the column defaults — every
document under a "Other" heading, nothing suggested — including on a brand new database,
because migration 0009 seeds the rows before these columns exist. Re-running the catalog
sync afterwards is what actually populates them, and it is the same helper the management
command uses, so the two can't drift.
"""

from django.db import migrations, models

from core.file_type_sync import sync_global_file_types


def fill_in_groups(apps, schema_editor):
    """Copy `group` / `is_default_suggestion` from the catalog onto the existing rows."""
    sync_global_file_types(apps.get_model('storage', 'FileType'))


class Migration(migrations.Migration):

    dependencies = [
        ('storage', '0010_credit_case_requirement_is_excluded'),
    ]

    operations = [
        migrations.AddField(
            model_name='filetype',
            name='group',
            field=models.CharField(default='other', help_text='Which heading this type is listed under when a user picks documents, e.g. "financial" or "tax" (see core.file_type_catalog.FileTypeGroup). Display only. Deliberately NOT the same as `category`: that is a recency bucket, which is why a timeless acta constitutiva is category "other" but group "legal".', max_length=20),
        ),
        migrations.AddField(
            model_name='filetype',
            name='is_default_suggestion',
            field=models.BooleanField(default=False, help_text='Whether this type is pre-ticked when an organization builds its first requirement template. A starting point only — the organization can remove any of them and add any other type.'),
        ),
        # Runs after the AddFields above, so the columns exist to be written to.
        # Reversing is a no-op: dropping the columns takes the values with them.
        migrations.RunPython(fill_in_groups, migrations.RunPython.noop),
    ]
