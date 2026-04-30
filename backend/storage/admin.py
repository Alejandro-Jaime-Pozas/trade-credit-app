from django.contrib import admin

# Register your models here.

from .models import (
    UploadDocument,
    DocumentDataExtract,
    Label,
)

admin.site.register(UploadDocument)
admin.site.register(DocumentDataExtract)
admin.site.register(Label)
