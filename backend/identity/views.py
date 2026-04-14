from rest_framework.viewsets import ModelViewSet
from .serializers import (
    CompanySerializer,
    UserSerializer,
)
from .models import (
    Company,
    User,
)


class UserViewSet(ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    # permission_classes = []
    # custom code for filtering queryset data...


class CompanyViewSet(ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    # permission_classes = []
    # custom code for filtering queryset data to user...
