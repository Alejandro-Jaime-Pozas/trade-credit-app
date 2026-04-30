from django.contrib import admin

# Register your models here.

from .models import (
    CreditCase,
)

admin.site.register(CreditCase)
