from django.core.validators import MinLengthValidator
from django.db import models
from phonenumber_field.modelfields import PhoneNumberField

from identity.models import Organization, User
from customers.choices_for_models import CustomerPersonaLegalType
from customers.constants import RFC_PERSONA_MORAL_LENGTH


class Customer(models.Model):
    """
    An organization's customer, can be persona moral or fisica.
    """

    name = models.CharField(
        max_length=100,
        help_text='Customer name.',
    )
    legal_name = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text='Customer legal name recognized by government.',
    )
    rfc = models.CharField(
        max_length=RFC_PERSONA_MORAL_LENGTH,
        validators=[MinLengthValidator(RFC_PERSONA_MORAL_LENGTH)],  # TODO change when persona fisica is implemented
        null=True,
        blank=True,
        help_text='Registro Federal de Contribuyentes for customer.',
    )
    type = models.CharField(
        max_length=20,
        choices=CustomerPersonaLegalType.choices,
        default=CustomerPersonaLegalType.MORAL,
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
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        help_text='''User's Organization that created this customer record.''',
    )

    # Address details as they appear on official SAT CSF.

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

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'rfc'],
                name='unique_customer_rfc_per_organization',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.rfc})'  # TODO maybe RFC not safe to expose


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
        help_text='Contact email address.',
    )
    phone_number = PhoneNumberField(
        region='MX',  # default phone region.
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
        related_name='customer_contacts',
        help_text='The customer this contact belongs to.',
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='customer_contacts',
        null=True,
        blank=True,
        help_text='''User's Organization that created this customer contact record.''',
    )  # required to enforce uniqueness of contact email within an organization, since different orgs could have contacts with same email
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text='User that created this customer record.',
    )

    # Allow duplicate contact emails across different organizations, but not within the same organization, since different orgs could have contacts with same email.
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'email'],
                name='unique_customer_contact_email_per_organization',
            ),
        ]

    def __str__(self):
        return f'<{self.first_name} {self.last_name} ({self.email})>'
