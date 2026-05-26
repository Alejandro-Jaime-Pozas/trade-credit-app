from identity.models import Organization

class OrganizationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.organization = None

        org_id = request.headers.get("X-Organization-ID")

        if org_id:
            try:
                request.organization = Organization.objects.get(id=org_id)
            except Organization.DoesNotExist:
                pass

        return self.get_response(request)
