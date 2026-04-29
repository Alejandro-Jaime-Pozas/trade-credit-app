from rest_framework import serializers

from .models import (
    Customer,
    CustomerContact,
)


class CustomerSerializer(serializers.HyperlinkedModelSerializer):

    customer_contacts = serializers.HyperlinkedRelatedField(
        many=True,
        read_only=True,
        view_name='customercontact-detail',
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
            'created_at',
            'updated_at',
            'created_by',
            'nombre_de_vialidad',
            'codigo_postal',
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
        ]
