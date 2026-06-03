from rest_framework.viewsets import ModelViewSet

from .models import (
    Customer,
    CustomerContact,
)
from .serializers import (
    CustomerSerializer,
    CustomerContactSerializer,
)


class CustomerViewSet(ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer

    def get_queryset(self):
        user_organizations = self.request.user.organizations.all()
        return self.queryset.filter(organization__in=user_organizations)


class CustomerContactViewSet(ModelViewSet):
    queryset = CustomerContact.objects.all()
    serializer_class = CustomerContactSerializer
