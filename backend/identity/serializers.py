from rest_framework import serializers

from .models import (
    Organization,
    User,
)


class UserSerializer(serializers.HyperlinkedModelSerializer):
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )
    organizations = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name='organization-detail',
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
            'first_name',
            'last_name',
            'created_at',
            'is_superuser',
            'is_staff',
            'is_active',
            'organizations',
        ]
        read_only_fields = [
            'first_name',
            'last_name',
            'is_superuser',
            'is_staff',
            'is_active',
            'is_superuser',
            'date_joined',
            'created_at',
        ]

    # custom code for create() or update() serializer methods
    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

class OrganizationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Organization
        fields = [
            'url',
            'id',
            'name',
            'email_domain',
        ]

    # custom code for create() or update() serializer methods
