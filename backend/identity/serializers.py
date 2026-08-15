from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from core.serializer_utils import NamedHyperlinkedModelSerializer, NamedHyperlinkedRelatedField

from .models import (
    Organization,
    User,
)


class UserSerializer(NamedHyperlinkedModelSerializer):
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
    )
    organizations = NamedHyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name='organization-detail',
        # Organization's own __str__ shows its email domain, not its name.
        display_source='name',
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
        ]

    def validate_password(self, value):
        """
        Apply Django's password rules (settings.AUTH_PASSWORD_VALIDATORS) at signup.

        DRF does NOT do this on its own: `password` is just a CharField here, so without
        this hook the API happily accepted a one-character password even though
        AUTH_PASSWORD_VALIDATORS (minimum length, too-common, all-numeric) was configured.
        Those validators only ever ran through Django's own auth forms, which this API
        never touches.

        Django raises its own ValidationError, which DRF doesn't recognise, so it is
        re-raised as the DRF one to come back as a normal 400 field error.
        """
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    # custom code for create() or update() serializer methods
    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        return user

    def update(self, instance, validated_data):
        email = validated_data.get('email')

        # if email is being updated, also update username to match, since we are using email as username
        if email and email != instance.email:
            instance.username = email

        return super().update(instance, validated_data)


class OrganizationSerializer(NamedHyperlinkedModelSerializer):

    users = NamedHyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name='user-detail',
    )
    class Meta:
        model = Organization
        fields = [
            'url',
            'id',
            'name',
            'email_domain',
            'users',
        ]

    # custom code for create() or update() serializer methods
