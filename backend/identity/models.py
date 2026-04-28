from django.core.exceptions import ValidationError
from django.db import models
from django.contrib.auth.models import BaseUserManager, AbstractUser
from django.core.validators import URLValidator


def validate_domain(value):
    validator = URLValidator(schemes=['http', 'https'])
    try:
        validator(f"http://{value}")  # Prepend http:// to validate as a domain
    except:
        raise ValidationError(f"{value} is not a valid domain, enter a valid domain like 'example.com'.")


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

        # Get or create the organization based on email domain and link to user
        # TODO later integrate with hunter.io API to get more accurate organization info based on email domain
        Organization.objects._get_or_create_from_user(user)

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
    User model that uses email as login but keeps username under the hood.
    Includes Organization m2m.
    """

    # keep username from AbstractUser (don’t set username = None)
    email = models.EmailField(unique=True, blank=False)
    # first_name, last_name, date_joined, username, is_staff, is_active, is_superuser are all inherited from AbstractUser

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
    name = models.CharField(max_length=100)
    email_domain = models.CharField(
        max_length=300,
        unique=True,
        validators=[validate_domain],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    users = models.ManyToManyField(
        User,
        related_name='organizations',
        blank=True,
    )

    objects = OrganizationManager()

    def clean(self):
        # Ensure email_domain is in correct format (e.g., example.com)
        if self.email_domain:
            validate_domain(self.email_domain)

    def save(self, *args, **kwargs):
        self.full_clean()  # enforces validation everywhere before saving to db
        super().save(*args, **kwargs)

    def __str__(self):
        return f"<Organization|id={self.pk}, email_domain={self.email_domain}>"
