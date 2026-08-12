import logging

from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import (
    ModelViewSet,
    ReadOnlyModelViewSet,
)

from core.mixins import OrganizationScopedMixin
from core.str_utils import pretty_print

from .serializers import (
    DocumentDataExtractSerializer,
    LabelSerializer,
    LabelValueSerializer,
    UploadDocumentSerializer,
)
from .models import (
    DocumentDataExtract,
    Label,
    LabelValue,
    UploadDocument,
)
from .services.db_object_handling import handle_upload_document_created

logger = logging.getLogger(__name__)


class UploadDocumentViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):

    queryset = UploadDocument.objects.all().prefetch_related('label_values__label')
    serializer_class = UploadDocumentSerializer
    organization_scoped_fields = {
        'customer': 'organization',
        'credit_case': 'customer__organization',
    }

    def get_queryset(self):
        # A doc can be linked to a customer, a credit_case, or both, so
        # organization scoping must check both relations — a single
        # `organization_lookup` (as OrganizationScopedMixin expects) can only
        # follow one path and would hide credit-case-only documents. Skip
        # straight to the base queryset and scope it ourselves.
        queryset = super(OrganizationScopedMixin, self).get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()
        if user.is_superuser:
            return queryset

        orgs = user.organizations.all()
        return queryset.filter(
            Q(customer__organization__in=orgs) | Q(credit_case__customer__organization__in=orgs)
        ).distinct()

    # This create override is required to replace single obj req/res with list of objs
    def create(self, request, *args, **kwargs):
        """
        Trigger gpt process if this was the last UploadDocument required
        in account application process.
        """
        # self.get_serializer() (not self.serializer_class(...)) is required here so
        # OrganizationScopedMixin.get_serializer() gets a chance to narrow the
        # customer/credit_case fields to the requesting user's organization.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        docs = serializer.save(uploaded_by=request.user)  # list[UploadDocument]

        # Run your side effects TODO later fix handling for new models, this is just temp for now
        for doc in docs:
            # Run gpt analysis of credit case if all required docs uploaded. The
            # UploadDocument row is already saved at this point (and the whole
            # request runs in one atomic transaction — see ATOMIC_REQUESTS), so a
            # failure here (e.g. an OpenAI outage) must not turn a successful
            # upload into a 500/rollback: log it and leave the doc un-classified.
            try:
                result = handle_upload_document_created(doc)  # TEMP TODO later fix handling for new models
                pretty_print(result)  # TEMP, this wont work for atomic txs
            except Exception:
                logger.exception('handle_upload_document_created failed for doc id=%s', doc.pk)

        # Return list response
        out = self.get_serializer(docs, many=True)
        return Response(out.data, status=status.HTTP_201_CREATED)


class DocumentDataExtractViewSet(
    OrganizationScopedMixin,
    ReadOnlyModelViewSet,
):

    queryset = DocumentDataExtract.objects.all()
    serializer_class = DocumentDataExtractSerializer
    organization_lookup = 'upload_document__customer__organization'  # TODO this is missing credit_case lookups if no customer linked to doc and only credit_case...fix


class LabelViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    """
    A Label is a custom field DEFINITION (e.g. "sucursal" for CreditCase) that the
    user creates and manages themselves. It holds no value — see LabelValueViewSet
    for setting/reading the per-object value of a Label.
    """

    queryset = Label.objects.all()
    serializer_class = LabelSerializer
    organization_lookup = 'organization'

    def perform_create(self, serializer):
        # Every Label belongs to the creating user's organization, same as Customer.
        serializer.save(
            organization=self.request.user.organizations.first(),
            created_by=self.request.user,
        )

    @action(detail=True, methods=['get'], url_path='existing-values')
    def existing_values(self, request, pk=None):
        """
        List the distinct values already used for this label, so a user can
        quickly reuse e.g. "MTY Norte" instead of retyping a near-duplicate.
        """
        label = self.get_object()
        values = list(
            label.values.order_by('value').values_list('value', flat=True).distinct()
        )
        return Response(values)


class LabelValueViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    """
    The per-object value of a Label (custom field). An object can have at most
    one LabelValue per Label — see the `unique_value_per_label_per_object`
    constraint on the model.
    """

    queryset = LabelValue.objects.all()
    serializer_class = LabelValueSerializer
    organization_lookup = 'label__organization'
    organization_scoped_fields = {'label': 'organization'}

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Set a Label's value on an object. This behaves like setting a real model
        field: if a value already exists for this (label, object), it's UPDATED
        in place (200) instead of raising a uniqueness conflict; otherwise a new
        LabelValue is created (201).
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        label = serializer.validated_data['label']
        object_id = serializer.validated_data['object_id']
        value = serializer.validated_data['value']

        label_value, created = LabelValue.objects.update_or_create(
            label=label,
            content_type=label.content_type,
            object_id=object_id,
            defaults={'value': value},
        )
        if created:
            label_value.created_by = request.user
            label_value.save(update_fields=['created_by'])

        out = self.get_serializer(label_value)
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(out.data, status=response_status)
