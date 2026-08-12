""" Mixins used to enforce multi-tenant organization scoping in views and serializers. """


class OrganizationScopedMixin:
    """
    Scope every user action on a view to the user's organization(s).

    Two halves, because Django and DRF enforce them in different places:

    - READS  — `organization_lookup` filters the queryset, so a user only ever sees
      their own organization's rows.
    - WRITES — `organization_scoped_fields` narrows the ForeignKey fields the user is
      allowed to point AT. Without this, DRF builds every FK field with an unfiltered
      `Model.objects.all()`, so a user could POST a link to another organization's row
      and attach their record to another tenant's data.

    Example on a viewset:

        organization_lookup = 'customer__organization'
        organization_scoped_fields = {'customer': 'organization'}

    `organization_lookup` is the ORM path from THIS view's model to Organization;
    each value in `organization_scoped_fields` is the path from THAT FIELD's model
    to Organization.
    """

    organization_lookup = None  # related lookup value. ie if customer_contact gets org through customer, then 'customer__organization'
    organization_scoped_fields = {}  # e.g. {'customer': 'organization'} - FK field name -> ORM path from that field's model to Organization

    def get_queryset(self):
        user = self.request.user

        queryset = super().get_queryset()

        if not user.is_authenticated:
            return queryset.none()

        if user.is_superuser:
            return queryset

        return queryset.filter(
            **{
                f"{self.organization_lookup}__in": user.organizations.all()
            }
        ).distinct()

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)

        user = self.request.user
        if not self.organization_scoped_fields or not user.is_authenticated or user.is_superuser:
            return serializer

        orgs = user.organizations.all()
        # With many=True DRF wraps the real serializer in a ListSerializer; the actual
        # fields to narrow live on its `.child`.
        fields = getattr(serializer, 'child', serializer).fields

        for field_name, org_lookup in self.organization_scoped_fields.items():
            field = fields.get(field_name)
            # Read-only fields carry no queryset, so there is nothing to protect.
            if field is None or getattr(field, 'queryset', None) is None:
                continue
            field.queryset = field.queryset.filter(**{f"{org_lookup}__in": orgs}).distinct()

        return serializer
