from rest_framework.exceptions import PermissionDenied

class OrganizationScopedMixin:
    def get_organization(self):
        org = self.request.organization

        if not org:
            raise PermissionDenied("Organization header missing")

        if org not in self.request.user.organizations.all():
            raise PermissionDenied("Invalid organization")

        return org
