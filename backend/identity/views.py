from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import AllowAny

from app.mixins import OrganizationScopedMixin

from .serializers import (
    OrganizationSerializer,
    UserSerializer,
)
from .models import (
    Organization,
    User,
)


class UserViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]  # TODO need to fix this, should do AllowAny ONLY FOR CREATE USER?
    organization_lookup = 'organizations'  # this is prob wrong, need to fix lookup syntax

    # def get_queryset(self):
    #     return super().get_queryset().filter(organization=self.request.organization)


class OrganizationViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Organization.objects.all()

        return self.request.user.organizations.all()

    def perform_create(self, serializer):
        org = serializer.save()
        self.request.user.organizations.add(org)
