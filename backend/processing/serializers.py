from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from core.constants import (
    ACCOUNT_APPLICATION_BASENAME,
    ACCOUNT_BASENAME,
    BURO_DE_CREDITO_REPORT_BASENAME,
    LOAN_ACCOUNT_APPLICATION_BASENAME,
    ORGANIZATION_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
)
from core.serializer_utils import NamedHyperlinkedModelSerializer, NamedHyperlinkedRelatedField

from .choices_for_models import CreditCaseFinalVerdict
from .models import (
    CreditCase,
    AccountApplication,
    BuroDeCreditoReport,
    LoanAccountApplication,
    LoanAgreementDocument,
    LoanVerdict,
    LoanVerdictAI,
)
from storage.models import RequirementTemplate, UploadDocument
from storage.services.requirements import seed_requirements_from_template


class CreditCaseSerializer(NamedHyperlinkedModelSerializer):
    # assigned_to defaults to the requesting user on create (see
    # CreditCaseViewSet.perform_create) but stays a normal writable/readable
    # field so it can still be viewed and reassigned from the credit case
    # detail page.

    organization = NamedHyperlinkedRelatedField(
        read_only=True,
        source='customer.organization',
        view_name=f'{ORGANIZATION_BASENAME}-detail',
        # Organization's own __str__ shows its email domain, not its name.
        display_source='name',
    )

    required_file_type_names = serializers.SerializerMethodField()

    def get_required_file_type_names(self, obj) -> list[str]:
        return sorted(obj.required_file_type_names)

    # Whether every required document is in. Computed from the case's current documents,
    # so it flips back to false if a requirement is added later.
    requirements_complete = serializers.SerializerMethodField()

    def get_requirements_complete(self, obj) -> bool:
        return obj.requirements_complete

    # Documents this case lists as nice-to-have. Shown alongside the required ones but
    # excluded from required_file_type_names, so they never block completion.
    optional_file_type_names = serializers.SerializerMethodField()

    def get_optional_file_type_names(self, obj) -> list[str]:
        return sorted(obj.optional_file_type_names)

    # Which requirement template to copy onto this new case. Write-only and optional:
    # when omitted, the organization's default template is used. An organization with no
    # template yet produces a case with no requirements, which is the signal the frontend
    # uses to prompt the user to set one up.
    requirement_template = serializers.PrimaryKeyRelatedField(
        queryset=RequirementTemplate.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    # --- verdict deadline ---------------------------------------------------
    # `verdict_due_days` itself is a normal writable model field (the per-case override).
    # Everything below is derived from it and is therefore read-only: they are computed on
    # the model so that the API and any backend caller can never disagree about whether a
    # case is late.

    verdict_due_at = serializers.SerializerMethodField()

    def get_verdict_due_at(self, obj) -> str | None:
        due = obj.verdict_due_at
        return due.isoformat() if due else None

    # Days passed since the case was created.
    days_since_created = serializers.SerializerMethodField()

    def get_days_since_created(self, obj) -> int | None:
        return obj.days_since_created

    # Days left before the verdict is overdue. Negative once the deadline has passed.
    days_until_verdict_due = serializers.SerializerMethodField()

    def get_days_until_verdict_due(self, obj) -> int | None:
        return obj.days_until_verdict_due

    is_verdict_overdue = serializers.SerializerMethodField()

    def get_is_verdict_overdue(self, obj) -> bool:
        return obj.is_verdict_overdue

    # Dynamic custom fields (Labels) set on this credit case, e.g. {"sucursal": "MTY Norte"}.
    # Read-only here — values are set/updated via LabelValueViewSet.
    custom_fields = serializers.SerializerMethodField()

    def get_custom_fields(self, obj) -> dict[str, str]:
        return {lv.label.name: lv.value for lv in obj.label_values.select_related('label').all()}

    class Meta:
        model = CreditCase
        fields = [
            'url',
            'id',
            'status',
            'verdict',
            'requested_amount',
            'currency',
            'requested_term_days',
            'created_at',
            'updated_at',
            'submitted_at',
            'verdict_at',
            'verdict_due_days',
            'verdict_due_at',
            'days_since_created',
            'days_until_verdict_due',
            'is_verdict_overdue',
            'assigned_to',
            'customer',
            'organization',
            'required_file_type_names',
            'optional_file_type_names',
            'requirements_complete',
            'requirements_completed_at',
            'requirement_template',
            'custom_fields',
        ]
        read_only_fields = [
            # 'verdict' is deliberately NOT here: a reviewer records the final
            # approve/reject decision by hand from the credit case detail page,
            # the same way they set status and assigned_to.
            'created_at',
            'updated_at',
            'submitted_at',
            'verdict_at',
            'organization',
            'required_file_type_names',
            'optional_file_type_names',
            'requirements_complete',
            'requirements_completed_at',
        ]

    @transaction.atomic
    def create(self, validated_data):
        """
        Create the credit case, then copy a requirement template onto it.

        The copy happens here rather than the case pointing at the template, so that
        editing the template later can't rewrite what an already-reviewed case was
        required to provide. See storage/services/requirements.py.
        """
        # Not a model field - pull it out before the case itself is created.
        template = validated_data.pop('requirement_template', None)

        credit_case = super().create(validated_data)

        if template is None:
            template = RequirementTemplate.objects.filter(
                organization=credit_case.customer.organization,
                is_default=True,
            ).first()

        request = self.context.get('request')
        seed_requirements_from_template(
            credit_case,
            template,
            user=getattr(request, 'user', None),
        )

        return credit_case

    def update(self, instance, validated_data):
        """
        Stamp `verdict_at` the moment a reviewer records a real decision.

        `verdict` is writable so a reviewer can approve/reject from the detail page, but
        the timestamp is not theirs to set — it records WHEN the decision was made. Only
        a change to an actual decision counts: moving back to 'pending' clears the stamp,
        because there is no longer a decision for it to be the time of.
        """
        new_verdict = validated_data.get('verdict')

        if new_verdict is not None and new_verdict != instance.verdict:
            validated_data['verdict_at'] = (
                timezone.now()
                if new_verdict != CreditCaseFinalVerdict.PENDING
                else None
            )

        return super().update(instance, validated_data)


# ================================================================
# Gemini added Simple serializers to view as nested serializers within other serializers
class SimpleUploadDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadDocument
        fields = [
            'url',
            'id',
            'file_type_name',
            'friendly_file_name',
            'original_title',
            'extracted_data',
        ]
        extra_kwargs = {
            'url': {'view_name': f'{UPLOAD_DOCUMENT_BASENAME}-detail'},
        }


class SimpleLoanVerdictAISerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanVerdictAI
        fields = [
            'url',
            'id',
            'status',
            'loan_amount',
            'annual_interest_rate',
            'payment_amount',
            'term_months',
            'analysis_summary',
        ]


class SimpleLoanVerdictSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanVerdict
        fields = [
            'url',
            'id',
            'status',
            'passes_thresholds',
        ]


class SimpleLoanAgreementDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanAgreementDocument
        fields = [
            'url',
            'id',
            'file',
            'created_at',
            'signed_at',
        ]


class LoanAccountApplicationSerializer(NamedHyperlinkedModelSerializer):
    account_application = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ACCOUNT_APPLICATION_BASENAME}-detail',
        display_source='name',
    )
    loan_verdicts = SimpleLoanVerdictSerializer(
        many=True,
        read_only=True,
    )
    loan_verdicts_ai = SimpleLoanVerdictAISerializer(
        many=True,
        read_only=True,
    )
    missing_file_type_names = serializers.ReadOnlyField(
        source='account_application.missing_file_type_names',
    )  # lets you reference related model's obj attrs
    buro_de_credito_reports = NamedHyperlinkedRelatedField(
        many=True,
        read_only=True,
        source='account_application.buro_de_credito_reports',
        view_name=f'{BURO_DE_CREDITO_REPORT_BASENAME}-detail',
    )

    class Meta:
        model = LoanAccountApplication
        fields = [
            'url',
            'id',
            'annual_revenue_ttm',
            'annual_expenses_ttm',
            'account_application',
            'loan_verdicts',
            'loan_verdicts_ai',
            'missing_file_type_names',
            'buro_de_credito_reports',
        ]


class AccountApplicationSerializer(NamedHyperlinkedModelSerializer):
    account = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ACCOUNT_BASENAME}-detail',
    )
    loan_account_application = LoanAccountApplicationSerializer(
        # required=True,
        read_only=True,
    )  # nested serializer
    loan_agreement_documents = SimpleLoanAgreementDocumentSerializer(
        many=True,
        read_only=True,
    )
    upload_documents = SimpleUploadDocumentSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = AccountApplication
        fields = [
            'url',
            'id',
            'status',
            'name',
            'type',
            'account',
            'loan_account_application',
            'loan_agreement_documents',
            'all_files_required_dates_complete',  # TEMP FOR TESTING ONLY
            'upload_documents',
        ]

    def create(self, validated_data):
        """
        Pop the extra fields for submodels like LoanAccountApplication.
        Create the main model. Create the submodels with popped data.
        """
        # Get the extra fields that should be passed into submodels
        loan_acct_app_data = validated_data.pop('loan_account_application', {})  # default to empty dict for testing...maybe remove later when inserting real loan acct data

        # Create the acct app model
        acct_app = AccountApplication.objects.create(**validated_data)

        # Create the loan acct app submodel, link to acct app model
        if acct_app.type == 'loan':
            LoanAccountApplication.objects.create(
                account_application=acct_app,
                **loan_acct_app_data,
            )
        # TODO replace with logic for checking later
        else:
            raise serializers.ValidationError('Not yet implemented logic for checking acct app.')

        return acct_app


class LoanVerdictSerializer(NamedHyperlinkedModelSerializer):
    loan_account_application = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{LOAN_ACCOUNT_APPLICATION_BASENAME}-detail',
    )

    class Meta:
        model = LoanVerdict
        fields = [
            'url',
            'id',
            'status',
            'principal',
            'interest_rate',
            'payment',
            'term',
            'analysis_summary',
            'passes_thresholds',
            'loan_account_application',
        ]
        read_only_fields = [
            'status',
            'principal',
            'interest_rate',
            'payment',
            'term',
            'analysis_summary',
            'passes_thresholds',
            'loan_account_application',
        ]


class LoanAgreementDocumentSerializer(NamedHyperlinkedModelSerializer):
    account_application = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ACCOUNT_APPLICATION_BASENAME}-detail',
        display_source='name',
    )

    class Meta:
        model = LoanAgreementDocument
        fields = [
            'url',
            'id',
            'created_at',
            'signed_at',
            'file',
            'account_application',
        ]
        read_only_fields = [
            'file',
        ]


class BuroDeCreditoReportSerializer(NamedHyperlinkedModelSerializer):
    class Meta:
        model = BuroDeCreditoReport
        fields = [
            'url',
            'id',
            'score',
            'status',
            'verdict',
            'account_applications',
            'json_response',
        ]
        read_only_fields = [
            'score',
            'status',
            'verdict',
            'account_applications',
            'json_response',
        ]


class LoanVerdictAISerializer(NamedHyperlinkedModelSerializer):
    loan_account_application = NamedHyperlinkedRelatedField(
        read_only=True,
        view_name=f'{LOAN_ACCOUNT_APPLICATION_BASENAME}-detail',
    )

    class Meta:
        model = LoanVerdictAI
        fields = [
            'url',
            'id',
            'status',
            'loan_amount',
            'annual_interest_rate',
            'payment_amount',
            'term_months',
            'analysis_summary',
            'loan_account_application',
        ]
        read_only_fields = [
            'status',
            'loan_amount',
            'annual_interest_rate',
            'payment_amount',
            'term_months',
            'analysis_summary',
            'loan_account_application',
        ]
# ================================================================
