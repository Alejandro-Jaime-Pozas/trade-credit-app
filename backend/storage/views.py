import logging

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import (
    ModelViewSet,
    ReadOnlyModelViewSet,
)

from core.mixins import OrganizationScopedMixin

from .serializers import (
    CreditCaseRequirementSerializer,
    DocumentDataExtractSerializer,
    FileTypeSerializer,
    LabelSerializer,
    LabelValueSerializer,
    RequirementTemplateSerializer,
    UploadDocumentSerializer,
)
from .models import (
    CreditCaseRequirement,
    DocumentDataExtract,
    FileType,
    Label,
    LabelValue,
    RequirementTemplate,
    UploadDocument,
)
from .services.requirements import (
    apply_template_to_case,
    diff_template_against_case,
    file_types_with_uploads,
    open_cases_for_template,
)
from processing.services.credit_case_status import handle_manual_requirement_change
from .tasks import process_upload_document

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
        Save the uploaded document(s) and hand classification to a background worker.

        The response returns as soon as the rows are saved, with `file_type_name` still
        null — the frontend already renders that as "Pending classification". A worker
        then asks OpenAI what each document is and fills in the rest, which is what makes
        a requirement tick off and can advance the credit case.

        Classification used to run here, inline. It costs three OpenAI round trips
        (10-30s), and because ATOMIC_REQUESTS wraps the whole request in one transaction,
        a Postgres connection was held open that entire time waiting on a third party.
        """
        # self.get_serializer() (not self.serializer_class(...)) is required here so
        # OrganizationScopedMixin.get_serializer() gets a chance to narrow the
        # customer/credit_case fields to the requesting user's organization.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        docs = serializer.save(uploaded_by=request.user)  # list[UploadDocument]

        for doc in docs:
            # on_commit, NOT a bare .delay(): under ATOMIC_REQUESTS these rows are not
            # committed until this request finishes, and a worker is a separate process
            # on its own database connection. Queue the job immediately and the worker
            # routinely wins the race, looks up an id that is not visible yet, and finds
            # nothing — leaving the document silently unclassified. on_commit holds the
            # message until the transaction has actually committed.
            transaction.on_commit(
                lambda doc_id=doc.pk: process_upload_document.delay(doc_id)
            )

        # Return list response
        out = self.get_serializer(docs, many=True)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        """
        Delete a document and recompute the credit case it was helping to satisfy.

        `requirements_complete` is derived from the documents that exist right now, so
        removing one can un-satisfy a requirement. Without recomputing, deleting the only
        bank statement would leave the case sitting in "pending final verdict" — advanced
        on the strength of a document that is no longer there.

        `handle_manual_requirement_change` is the right helper (rather than the gentler
        `handle_requirements_progress`) because this is a user deliberately removing
        something from one specific case, exactly like removing a requirement by hand: it
        is allowed to pull the case BACK to "missing documents".

        The case is read before the delete simply because the FK is about to go away.
        Its `requirements_complete` is still accurate afterwards: that property counts
        documents with a fresh query each time it is read, not from a cached list.
        """
        credit_case = instance.credit_case
        instance.delete()

        if credit_case is not None:
            handle_manual_requirement_change(credit_case)


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


class FileTypeViewSet(
    ReadOnlyModelViewSet,
):
    """
    The kinds of documents that can be required, for building requirement templates.

    Read-only: app-provided types are seeded from core/file_type_catalog.py by
    `manage.py sync_file_types`. Organization-created types are planned but not built
    (see docs/versions/v2.md).
    """

    queryset = FileType.objects.all()
    serializer_class = FileTypeSerializer

    def get_queryset(self):
        """
        Return the app-provided types (organization is null, shared by everyone) plus
        the requesting user's own organization's types.

        This can't use OrganizationScopedMixin: that mixin builds a single
        `filter(organization__in=...)`, which would drop every global row, since NULL
        never matches an IN clause.
        """
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        if user.is_superuser:
            return queryset

        return queryset.filter(
            Q(organization__isnull=True) | Q(organization__in=user.organizations.all())
        ).distinct()


class RequirementTemplateViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    """
    An organization's reusable lists of documents to require on a credit case.

    A new credit case is seeded from the organization's default template. Editing a
    template afterwards does not touch existing cases on its own — use `impact` to see
    what would change and `apply` to push it onto chosen open cases.
    """

    queryset = RequirementTemplate.objects.all().prefetch_related('items__file_type')
    serializer_class = RequirementTemplateSerializer
    organization_lookup = 'organization'

    def perform_create(self, serializer):
        # Every template belongs to the creating user's organization, same as Customer.
        serializer.save(
            organization=self.request.user.organizations.first(),
            created_by=self.request.user,
        )

    def _serialize_file_types(self, file_types):
        return [
            {'id': file_type.id, 'key': file_type.key, 'label_en': file_type.label_en}
            for file_type in file_types
        ]

    @action(detail=True, methods=['get'])
    def impact(self, request, pk=None):
        """
        Show what re-applying this template would do to each open credit case.

        Only cases seeded from this template and not yet submitted are considered — a
        submitted case's requirement list is the evidence its reviewer worked from.

        The diff is computed fresh against each case's current rows rather than from a
        record of what the user just edited, so this is safe to call any time and
        returns an empty list once everything is in sync.
        """
        template = self.get_object()

        results = []
        for credit_case in open_cases_for_template(template):
            diff = diff_template_against_case(template, credit_case)
            if not (diff['adds'] or diff['removes'] or diff['updates']):
                continue

            results.append({
                'credit_case_id': credit_case.id,
                'customer_name': credit_case.customer.name,
                'adds': self._serialize_file_types(diff['adds']),
                'removes': self._serialize_file_types(diff['removes']),
                'updates': self._serialize_file_types(diff['updates']),
                # Removing a requirement the customer already satisfied leaves that
                # document in place but no longer counting - worth warning about first.
                'removes_with_uploads': self._serialize_file_types(
                    file_types_with_uploads(credit_case, diff['removes'])
                ),
            })

        return Response({'credit_cases': results})

    @action(detail=True, methods=['post'])
    def apply(self, request, pk=None):
        """
        Re-apply this template to the credit cases named in `credit_case_ids`.

        Deliberately explicit rather than "all open cases": the user picks after seeing
        the impact report. Requirements they added by hand are preserved, and a case's
        status is never changed - it simply reports any new document as missing.
        """
        template = self.get_object()

        credit_case_ids = request.data.get('credit_case_ids')
        if not isinstance(credit_case_ids, list) or not credit_case_ids:
            return Response(
                {'detail': 'credit_case_ids must be a non-empty list of credit case ids.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Re-derive the allowed cases from the database instead of trusting the ids in
        # the request body: this is the only thing standing between a crafted payload
        # and another organization's credit cases.
        allowed = {case.id: case for case in open_cases_for_template(template)}
        unknown = [i for i in credit_case_ids if i not in allowed]
        if unknown:
            return Response(
                {
                    'detail': (
                        'These credit case ids are not open cases belonging to this '
                        f'template: {unknown}'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        applied = []
        with transaction.atomic():
            for credit_case_id in credit_case_ids:
                diff = apply_template_to_case(
                    template, allowed[credit_case_id], user=request.user
                )
                applied.append({
                    'credit_case_id': credit_case_id,
                    'added': self._serialize_file_types(diff['adds']),
                    'removed': self._serialize_file_types(diff['removes']),
                    'updated': self._serialize_file_types(diff['updates']),
                })

        return Response({'credit_cases': applied})


class CreditCaseRequirementViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):
    """
    The documents one specific credit case needs.

    Used for per-case deviations - the extra document needed for one particular
    customer, or dropping one that doesn't apply. Anything created here is marked
    `source='manual'` and is never altered by a later template re-sync.
    """

    # Excluded rows are bookkeeping (a record of a document turned off), not
    # requirements, so they never appear in the API's list of what a case needs.
    queryset = (
        CreditCaseRequirement.objects
        .filter(is_excluded=False)
        .select_related('file_type', 'credit_case')
    )
    serializer_class = CreditCaseRequirementSerializer
    organization_lookup = 'credit_case__customer__organization'
    organization_scoped_fields = {'credit_case': 'customer__organization'}

    def _reject_if_submitted(self, credit_case):
        """
        Refuse to change what a case requires once it has been submitted for approval.

        At that point the requirement list is the evidence the reviewer is working from;
        editing it afterwards would rewrite the basis of a decision in progress.
        """
        if credit_case.submitted_at is not None:
            raise serializers.ValidationError(
                'This credit case has been submitted for approval, so its required '
                'documents can no longer be changed.'
            )

    def get_serializer(self, *args, **kwargs):
        """
        Narrow the selectable file types to global ones plus the user's own.

        organization_scoped_fields can't express this: it only knows how to filter a
        field's queryset down to the user's organizations, which would exclude every
        app-provided (null-organization) type.
        """
        serializer = super().get_serializer(*args, **kwargs)

        user = self.request.user
        if not user.is_authenticated or user.is_superuser:
            return serializer

        fields = getattr(serializer, 'child', serializer).fields
        file_type_field = fields.get('file_type')
        if file_type_field is not None and getattr(file_type_field, 'queryset', None) is not None:
            file_type_field.queryset = file_type_field.queryset.filter(
                Q(organization__isnull=True) | Q(organization__in=user.organizations.all())
            ).distinct()

        return serializer

    def perform_create(self, serializer):
        credit_case = serializer.validated_data['credit_case']
        self._reject_if_submitted(credit_case)

        file_type = serializer.validated_data['file_type']

        # Re-adding something previously dropped from this case: the row still exists,
        # marked excluded, so turn it back on rather than colliding with
        # unique(credit_case, file_type).
        existing = CreditCaseRequirement.objects.filter(
            credit_case=credit_case, file_type=file_type,
        ).first()
        if existing is not None:
            existing.is_excluded = False
            existing.is_required = serializer.validated_data.get('is_required', True)
            existing.save(update_fields=['is_excluded', 'is_required'])
            serializer.instance = existing
        else:
            serializer.save(
                source=CreditCaseRequirement.Source.MANUAL,
                created_by=self.request.user,
            )

        handle_manual_requirement_change(credit_case)

    def perform_update(self, serializer):
        self._reject_if_submitted(serializer.instance.credit_case)
        serializer.save()
        handle_manual_requirement_change(serializer.instance.credit_case)

    def perform_destroy(self, instance):
        """
        Drop a document from this one case.

        A row that came from the organization's template is EXCLUDED rather than deleted,
        so the removal sticks: the next template re-sync sees the file type is already
        accounted for and will not quietly put it back. A row the user added by hand has
        nothing that would resurrect it, so it is simply deleted.
        """
        credit_case = instance.credit_case
        self._reject_if_submitted(credit_case)

        if instance.source == CreditCaseRequirement.Source.TEMPLATE:
            instance.is_excluded = True
            instance.save(update_fields=['is_excluded'])
        else:
            instance.delete()

        handle_manual_requirement_change(credit_case)
