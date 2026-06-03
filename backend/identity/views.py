from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import AllowAny

from .serializers import (
    OrganizationSerializer,
    UserSerializer,
)
from .models import (
    Organization,
    User,
)


class UserViewSet(ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    # custom code for filtering queryset data...

    # def get_queryset(self):
    #     return super().get_queryset().filter(organization=self.request.organization)


class OrganizationViewSet(ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    # permission_classes = []
    # custom code for filtering queryset data to user...
