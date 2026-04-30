from django.contrib import admin

# Register your models here.

from .models import (
    Customer,
    CustomerContact,
)


admin.site.register(Customer)
admin.site.register(CustomerContact)
