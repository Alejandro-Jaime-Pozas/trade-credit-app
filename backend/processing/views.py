from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import (
    ModelViewSet,
    ReadOnlyModelViewSet,
)

from core.mixins import OrganizationScopedMixin
from storage.serializers import SetCreditCaseRequirementsSerializer
from storage.services.requirements import (
    replace_requirements_with_file_types,
    reseed_requirements_from_template,
)

from .serializers import (
    CreditCaseSerializer,
    AccountApplicationSerializer,
    BuroDeCreditoReportSerializer,
    LoanAccountApplicationSerializer,
    LoanVerdictAISerializer,
    LoanVerdictSerializer,
)
from .models import (
    CreditCase,
    AccountApplication,
    BuroDeCreditoReport,
    LoanAccountApplication,
    LoanVerdict,
    LoanVerdictAI,
)


class CreditCaseViewSet(
    OrganizationScopedMixin,
    ModelViewSet,
):

    queryset = (
        CreditCase.objects.all()
        .order_by('-updated_at')
        .prefetch_related('label_values__label', 'requirements__file_type')
    )
    serializer_class = CreditCaseSerializer
    organization_lookup = 'customer__organization'
    organization_scoped_fields = {
        'customer': 'organization',
        'assigned_to': 'organizations',  # User -> Organization m2m (identity.Organization.users)
        'requirement_template': 'organization',
    }

    def perform_create(self, serializer):
        # Default assigned_to to the requesting user when the client didn't
        # explicitly set one (the frontend's create flow never sends it), so a
        # credit case is always owned by whoever created it. An explicit
        # assigned_to in the request (e.g. creating a case on someone else's
        # behalf) is still respected.
        if serializer.validated_data.get('assigned_to'):
            serializer.save()
        else:
            serializer.save(assigned_to=self.request.user)

    @action(detail=True, methods=['post'], url_path='set-requirements')
    def set_requirements(self, request, pk=None):
        """
        Set exactly which documents this credit case requires.

        Exists because the credit case is created BEFORE the user picks its documents in
        the create-case flow, so the client has to reconcile an already-seeded case
        against the user's choice. Doing that from the browser would be a series of
        deletes and posts with no transaction around them, leaving a half-configured case
        whenever one call failed.

        Two mutually exclusive bodies, matching the two things the UI lets a user click:

          {"requirement_template": <id>}  - "use my organization's default". Rows are
              copied from the template and stay linked to it, so this case is still
              picked up by that template's later impact/apply re-syncs.

          {"file_type_ids": [<id>, ...]}  - "pick documents for this customer". Rows are
              written as manual, so a later re-sync deliberately skips this case: the
              user has opted out of the default for it.
        """
        credit_case = self.get_object()  # already organization-scoped by the mixin

        serializer = SetCreditCaseRequirementsSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        template = serializer.validated_data.get('requirement_template')
        if template is not None:
            reseed_requirements_from_template(credit_case, template, user=request.user)
        else:
            replace_requirements_with_file_types(
                credit_case,
                serializer.validated_data['file_type_ids'],
                user=request.user,
            )

        credit_case.refresh_from_db()
        return Response({
            'credit_case_id': credit_case.id,
            'required_file_type_names': sorted(credit_case.required_file_type_names),
            'optional_file_type_names': sorted(credit_case.optional_file_type_names),
        })


# ================================================================
class AccountApplicationViewSet(ModelViewSet):

    queryset = AccountApplication.objects.all()
    serializer_class = AccountApplicationSerializer


class LoanAccountApplicationViewSet(ModelViewSet):

    queryset = LoanAccountApplication.objects.all()
    serializer_class = LoanAccountApplicationSerializer


class LoanVerdictViewSet(ModelViewSet):  # TODO ReadOnlyModelViewSet when prod

    queryset = LoanVerdict.objects.all()
    serializer_class = LoanVerdictSerializer


class LoanVerdictAIViewSet(ReadOnlyModelViewSet):

    queryset = LoanVerdictAI.objects.all()
    serializer_class = LoanVerdictAISerializer


class BuroDeCreditoReportViewSet(
    ReadOnlyModelViewSet,
):

    queryset = BuroDeCreditoReport.objects.all()
    serializer_class = BuroDeCreditoReportSerializer
# ================================================================
