from django.db import models


class CustomerPersonaLegalType(models.TextChoices):
    """
    SAT-style taxpayer category for the customer:
    fisica or moral.
    """
    FISICA = 'fisica', 'Persona física'
    MORAL = 'moral', 'Persona moral'
