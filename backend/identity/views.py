from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import AllowAny, IsAuthenticated

from core.mixins import OrganizationScopedMixin

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
    organization_lookup = 'organizations'  # this is prob wrong, need to fix lookup syntax

    def get_permissions(self):
        # Signup (create) must be reachable by anonymous visitors; every other
        # action (list/retrieve/update/delete) requires a logged-in user.
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]


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
