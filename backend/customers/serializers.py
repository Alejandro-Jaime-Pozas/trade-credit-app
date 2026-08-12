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

    # Dynamic custom fields (Labels) set on this customer, e.g. {"sucursal": "MTY Norte"}.
    # Read-only here — values are set/updated via LabelValueViewSet.
    custom_fields = serializers.SerializerMethodField()

    def get_custom_fields(self, obj) -> dict[str, str]:
        return {lv.label.name: lv.value for lv in obj.label_values.select_related('label').all()}

    class Meta:
        model = Customer
        fields = [
            # TODO later include more address fields
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
            'custom_fields',
        ]
        read_only_fields = [
            'url',
            'id',
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
            'organization',  # derived from customer.organization in validate() below, never client-set
        ]

    def validate(self, attrs):
        """
        Keep `organization` in lockstep with the customer's own organization. These
        are two separate columns that could otherwise disagree, and the unique
        (organization, email) constraint (see CustomerContact.Meta) is only
        meaningful if `organization` always matches the customer the contact
        actually belongs to.
        """
        customer = attrs.get('customer') or getattr(self.instance, 'customer', None)
        if customer:
            attrs['organization'] = customer.organization
        return attrs
