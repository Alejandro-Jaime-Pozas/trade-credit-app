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


class CustomerContactViewSet(ModelViewSet):
    queryset = CustomerContact.objects.all()
    serializer_class = CustomerContactSerializer
