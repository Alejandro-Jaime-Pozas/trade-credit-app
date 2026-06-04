""" Mixins useful in views. """


class OrganizationScopedMixin:
    """
    Template to scope other model views to the user's (active) organization.

    Queryset must be customized as a lookup to ensure accurate relationship lookup.
    """

    organization_lookup = None  # related lookup value. ie if customer_contact gets org through customer, then 'customer__organization'

    def get_queryset(self):
        user = self.request.user

        queryset = super().get_queryset()

        if user.is_superuser:
            return queryset

        return queryset.filter(
            **{
                f"{self.organization_lookup}__in": user.organizations.all()
            }
        ).distinct()
