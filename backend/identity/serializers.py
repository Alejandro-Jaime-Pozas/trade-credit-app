from rest_framework import serializers

from .models import (
    Company,
    User,
)


class UserSerializer(serializers.HyperlinkedModelSerializer):
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )
    companies = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name='company-detail',
    )
    class Meta:
        model = User
        fields = [
            'url',
            'id',
            'email',
            'password',
            'date_joined',
            # 'username',  # no need for now, user manager auto-sets this
            # 'first_name',
            # 'last_name',
            'is_superuser',
            'is_staff',
            'is_active',
            'companies',
        ]
        read_only_fields = [
            'is_superuser',
            'date_joined',
        ]

    # custom code for create() or update() serializer methods

class CompanySerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Company
        fields = [
            'url',
            'id',
            'name',
            'email_domain',
        ]

    # custom code for create() or update() serializer methods
