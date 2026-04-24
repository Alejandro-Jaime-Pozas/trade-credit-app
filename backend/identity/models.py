from django.core.exceptions import ValidationError
from django.db import models
from django.contrib.auth.models import BaseUserManager, AbstractUser


class UserManager(BaseUserManager):
    """Manager for custom User model using email instead of username."""

    def _create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValidationError("User must have an email address.")

        # Normalize (lowercase domain)
        email = self.normalize_email(email)

        # 👇 Always set username = email by default
        username = extra_fields.pop("username", email)

        user = self.model(
            email=email,
            username=username,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        extra_fields.setdefault("is_active", True)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    User model that logs in with email but keeps username under the hood.
    Includes Organization m2m.
    """

    # keep username from AbstractUser (don’t set username = None)
    email = models.EmailField(unique=True, blank=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []  # email is used as the username, so no extra required fields

    objects = UserManager()

    def __str__(self):
        return f"<User|id={self.pk}, email={self.email}, username={self.username}>"


class OrganizationManager(models.Manager):
    """ Manager for Organization model. Pass in user email to get or create organization. """

    # Pass in the user obj to check email, format as domain,
    # check if exists in organizations, link to user if so, else create
    def _get_or_create_from_user(self, user, **extra_fields):

        # Extract the email domain from user email
        email = user.email or ''

        email_domain = email.split('@')[-1].strip().lower() if '@' in email else None

        if not email_domain:
            raise ValueError('Valid User email is required to determine organization.')
        # TODO replace this with hunter.io API functionality from integrations module...
        name = email_domain.split('.')[0].title()

        # Get or create the organization
        organization, created = Organization.objects.get_or_create(
            email_domain=email_domain,
            name=name,
            **extra_fields,
        )

        # Link organization to the user
        user.organizations.add(organization)

        return organization, created


class Organization(models.Model):
    """Organization model based on user email domain."""
    name = models.CharField(max_length=256)
    email_domain = models.CharField(max_length=512, unique=True)
    users = models.ManyToManyField(
        User,
        related_name='organizations',
        blank=True,
    )

    objects = OrganizationManager()

    def __str__(self):
        return f"<Organization|id={self.pk}, email_domain={self.email_domain}>"
