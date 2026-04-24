from django.core.validators import MinLengthValidator
from django.db import models

from identity.models import User
from customers.choices_for_models import CustomerPersonType
from customers.constants import RFC_PERSONA_MORAL_LENGTH


class Customer(models.Model):
    """
    An organization's customer, can be persona moral or fisica.
    """

    name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Organization name.',
    )
    legal_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Organization legal name recognized by government.',
    )
    rfc = models.CharField(
        max_length=RFC_PERSONA_MORAL_LENGTH,
        validators=[MinLengthValidator(RFC_PERSONA_MORAL_LENGTH)],
        unique=True,
        null=True,
        blank=True,
        help_text='Registro Federal de Contribuyentes for organization.',
    )
    type = models.CharField(
        max_length=20,
        choices=CustomerPersonType.choices,
        null=True,
        blank=True,
        help_text='Persona moral o fisica.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='User that created this customer record.',
    )

    # Address details

    codigo_postal = models.CharField(
        max_length=12,
        null=True,
        blank=True,
        help_text='Zip code.'
    )
    tipo_de_vialidad = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text='Calle, avenida, etc.',
    )
    nombre_de_vialidad = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre de la calle, avenida, etc.',
    )
    numero_exterior = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Numero visible desde la calle.',
    )
    numero_interior = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Numero interior, si aplica.',
    )
    nombre_de_la_colonia = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre de la colonia.',
    )
    nombre_de_la_localidad = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre de la localidad, si aplica.',
    )
    nombre_del_municipio = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre del municipio o demarcacion territorial.',
    )
    nombre_de_la_entidad_federativa = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Nombre del estado nacional.',
    )
    entre_calle = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Entre calle 1.',
    )
    y_calle = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Entre calle 2.',
    )


class CustomerContact(models.Model):
    """
    Contact information for a customer.

    A business customer may have multiple contacts, such as a purchasing manager, accounts payable contact, etc. This model captures the relevant information for each contact person associated with a customer.
    """

    first_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Contact first name.',
    )
    last_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Contact last name.',
    )
    email = models.EmailField(
        null=True,
        blank=True,
        help_text='Contact email address.',
    )
    phone_number = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        help_text='Contact phone number.',
    )
    role = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text='Contact role or position within the customer organization.',
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name='contacts',
        help_text='The customer this contact belongs to.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='User that created this customer record.',
    )
