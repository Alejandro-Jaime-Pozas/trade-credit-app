from rest_framework.viewsets import ModelViewSet

from core.mixins import OrganizationScopedMixin

from .models import (
    Customer,
    CustomerContact,
)
from .serializers import (
    CustomerSerializer,
    CustomerContactSerializer,
)


class CustomerViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    queryset = Customer.objects.all().prefetch_related('label_values__label')
    serializer_class = CustomerSerializer
    organization_lookup = 'organization'

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organizations.first(),
            created_by=self.request.user,
        )


class CustomerContactViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    queryset = CustomerContact.objects.all()
    serializer_class = CustomerContactSerializer
    organization_lookup = 'organization'
    organization_scoped_fields = {'customer': 'organization'}

    def perform_create(self, serializer):
        # organization is derived from customer.organization in the serializer's
        # validate() (see CustomerContactSerializer) - don't force it here too, or
        # this would silently override that with the user's (possibly wrong, for a
        # multi-org user) first organization.
        serializer.save(created_by=self.request.user)
