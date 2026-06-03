from rest_framework import serializers

from core.constants import (
    ACCOUNT_APPLICATION_BASENAME,
    ACCOUNT_BASENAME,
    BURO_DE_CREDITO_REPORT_BASENAME,
    LOAN_ACCOUNT_APPLICATION_BASENAME,
    ORGANIZATION_BASENAME,
    UPLOAD_DOCUMENT_BASENAME,
)

from .models import (
    CreditCase,
    AccountApplication,
    BuroDeCreditoReport,
    LoanAccountApplication,
    LoanAgreementDocument,
    LoanVerdict,
    LoanVerdictAI,
)
from storage.models import UploadDocument


class CreditCaseSerializer(serializers.HyperlinkedModelSerializer):

    # assigned_to = serializers.HiddenField(
    #     default=serializers.CurrentUserDefault()
    # )  # TODO implement later

    organization = serializers.HyperlinkedRelatedField(
        read_only=True,
        source='customer.organization',
        view_name=f'{ORGANIZATION_BASENAME}-detail',
    )

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
            'submitted_at',
            'verdict_at',
            # 'assigned_to',
            'customer',
            'organization',
        ]
        read_only_fields = [
            'status',
            'verdict',
            'created_at',
            'submitted_at',
            'verdict_at',
            # 'assigned_to',
            'organization',
        ]


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


class LoanAccountApplicationSerializer(serializers.HyperlinkedModelSerializer):
    account_application = serializers.HyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ACCOUNT_APPLICATION_BASENAME}-detail',
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
    buro_de_credito_reports = serializers.HyperlinkedRelatedField(
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


class AccountApplicationSerializer(serializers.HyperlinkedModelSerializer):
    account = serializers.HyperlinkedRelatedField(
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


class LoanVerdictSerializer(serializers.HyperlinkedModelSerializer):
    loan_account_application = serializers.HyperlinkedRelatedField(
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


class LoanAgreementDocumentSerializer(serializers.HyperlinkedModelSerializer):
    account_application = serializers.HyperlinkedRelatedField(
        read_only=True,
        view_name=f'{ACCOUNT_APPLICATION_BASENAME}-detail'
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


class BuroDeCreditoReportSerializer(serializers.HyperlinkedModelSerializer):
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


class LoanVerdictAISerializer(serializers.HyperlinkedModelSerializer):
    loan_account_application = serializers.HyperlinkedRelatedField(
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
