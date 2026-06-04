from rest_framework.viewsets import ModelViewSet

from app.mixins import OrganizationScopedMixin

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
    queryset = Customer.objects.all()
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

    def perform_create(self, serializer):
        serializer.save(
            organization=self.request.user.organizations.first(),
            created_by=self.request.user,
        )
