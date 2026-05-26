from rest_framework import serializers

from core.constants import CUSTOMER_CONTACT_BASENAME

from .models import (
    Customer,
    CustomerContact,
)


class CustomerSerializer(serializers.HyperlinkedModelSerializer):

    customer_contacts = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name=f'{CUSTOMER_CONTACT_BASENAME}-detail',
    )

    class Meta:
        model = Customer
        fields = [
            'url',
            'id',
            'name',
            'legal_name',
            'rfc',
            'type',
            'nombre_de_vialidad',
            'codigo_postal',
            'created_at',
            'updated_at',
            'organization',
            'created_by',
            'customer_contacts',
        ]
        read_only_fields = [
            'url',
            'id',
            'legal_name',
            'rfc',
            'type',
            'nombre_de_vialidad',
            'codigo_postal',
            'created_at',
            'updated_at',
            'organization',
            'created_by',
            'customer_contacts',
        ]


class CustomerContactSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CustomerContact
        fields = [
            'url',
            'id',
            'first_name',
            'last_name',
            'email',
            'phone_number',
            'role',
            'created_at',
            'updated_at',
            'created_by',
            'customer',
            'organization',
        ]
        read_only_fields = [
            'url',
            'id',
            'created_at',
            'updated_at',
            'created_by',
            # 'customer',
            'organization',
        ]
