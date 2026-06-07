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


class OrganizationViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

    def get_queryset(self):
        """
        TEMP!!! Superusers can see all organizations,
        regular users can only see their own organizations.
        """
        if self.request.user.is_superuser:
            return Organization.objects.all()

        return self.request.user.organizations.all()

    def perform_create(self, serializer):
        """
        When creating an organization, we also want to add
        the creating user to that organization.
        """
        org = serializer.save()
        self.request.user.organizations.add(org)
