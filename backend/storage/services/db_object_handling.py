"""
Handle any object operations not directly related to drf implementations.
"""


from storage.services.loan_term_handling import (
    create_loan_verdict_obj,
    run_buro_de_credito_process,
)
from integrations.buro_de_credito.json_response_sample import json_response
from processing.services.account_application import (
    check_aggregate_satisfied_month_intervals,
    check_all_files_required_dates_complete,
)
from core.constants import (
    LOAN_FILE_TYPE_NAMES_REQUIRED,
)
from processing.loan_term_calculations.constants import CREDIT_SCORE_VERDICT
from core.str_utils import pretty_print
from storage.models import UploadDocument
from processing.file_creation.loan_agreement_pdf_generator import (
    LoanAgreementPDFGenerator,
)
from processing.models import (
    AccountApplication,
    LoanAgreementDocument,
    LoanVerdict,
    LoanVerdictAI,
)
from processing.choices_for_models import (
    ApplicationStatus,
)
from integrations.openai.services.gpt import GPTService


def handle_upload_document_created(doc):
    """
    1. Extract important file data using gpt for later use and to
    show user a friendly name for their file.
    2. If all required files from user have been uploaded, trigger the
    openai loan analyzer process. If loan is approved, also create the
    loan agreement document for user to sign.

    Return a database obj if gpt analysis runs, else dict.
    """

    # Get UploadDocument's related account application
    acct_app = doc.account_applications.first()  # TODO may need to modify later since vague (but usually only one acct app while user creating/uploading files)
    if not acct_app:
        raise ValueError('UploadDocument must have a related AccountApplication obj.')

    # If acct_app has been rejected, skip gpt analysis and return the acct_app
    if acct_app.status == ApplicationStatus.REJECTED:
        return acct_app

    # Run gpt to update the doc's file_type_name, extracted_data
        # if file_type_name in required docs, then acct_app will pick it up automatically
    GPTService(acct_app).run_gpt_file_data_extraction(doc)

    # Update the doc's friendly file name: include file_type_name, gpt file dates
    doc.refresh_from_db()
    create_friendly_file_name(doc)

    # Get the doc's file_type_name
    file_type_name = doc.file_type_name
    if not file_type_name:
        return f'UploadDocument should have a file_type_name field from gpt process.'

    # If file_type_name is Const de Situacion Fiscal, run credit process
    if file_type_name == 'constancia_de_situacion_fiscal':
        verdict = run_buro_de_credito_process(doc=doc, acct_app=acct_app)

        # If verdict for credit process is failed, terminate the account_application's lifecycle, set status of account_application to REJECTED, reject the loan applicant based on credit score
        if verdict['passed'] == False:
            acct_app.status = ApplicationStatus.REJECTED
            acct_app.save()
            print('Credit score did not pass minimum threshold.')
            return verdict['bdc_report_obj']  # BuroDeCreditoReport obj

    # Get the loan_acct_app and loan_verdict
    loan_acct_app = acct_app.loan_account_application
    loan_verdict_obj = loan_acct_app.loan_verdicts.order_by('-id').first()  # grab latest

    # If a related loan verdict obj already exists, skip openai process
    if loan_verdict_obj:
        print('\nloan_verdict obj already exists, skipping openai process.', loan_verdict_obj)
        return loan_verdict_obj

    # Get the missing file type names and their missing dates (if any) to check date range completion
    acct_app_docs_are_completed = check_all_files_required_dates_complete(
        acct_app=acct_app,
        file_type_names=LOAN_FILE_TYPE_NAMES_REQUIRED,
    )
    print('\nacct_app req docs are complete:', acct_app_docs_are_completed)  # TEMP
    print(acct_app.all_files_required_dates_complete)  # TEMP
    # pretty_print(acct_app.all_files_required_dates_complete)  # TEMP not working

    # If no missing file type names in application and no missing dates, change its status to pending review, run loan analysis process
    if acct_app.total_missing_files == 0 and acct_app_docs_are_completed:
        acct_app.status = ApplicationStatus.PENDING_INTERNAL_REVIEW
        acct_app.save()

        # Create loan verdict db obj with loan terms
        loan_verdict_obj = create_loan_verdict_obj(acct_app=acct_app)

        # If loan verdict approved, change acct_app status to pending user agreement, and create the user loan agreement document, link it to the acct app
        if loan_verdict_obj:
            if loan_verdict_obj.status == 'approved':
                acct_app.status = ApplicationStatus.PENDING_USER_AGREEMENT
                loan_agmt_doc_obj = create_loan_agreement_document(
                    account_application=acct_app,
                    loan_verdict_obj=loan_verdict_obj,
                )
                acct_app.save()
                return {
                    'loan_verdict': loan_verdict_obj,
                    'loan_agreement_document': loan_agmt_doc_obj,
                }
            # Else set status to rejected
            elif loan_verdict_obj.status == 'rejected':
                acct_app.status = ApplicationStatus.REJECTED
                acct_app.save()
                return {
                    'loan_verdict': loan_verdict_obj,
                }
        else:
            return 'Error creating LoanVerdict object, all required files uploaded by user...check process.'


        # # TODO this is the process that takes a long time, implement celery/redis later and openai api fails/errors
        # # ===========================IN PROGRESS================================
        # # If account application has all upload_documents submitted, trigger gpt process
        # # TODO WILL REPLACE THIS BELOW WITH INTERNAL LOAN ANALYSIS PROCESS...
        # GPTService(acct_app).run_gpt_loan_verdict()

        # loan_verdict_obj = loan_acct_app.loan_verdicts_ai.order_by('-id').first()

        # if loan_verdict_obj:
        #     # If gpt process success, change application status to pending user agreement, and create the user loan agreement document, link it to the acct app
        #     if loan_verdict_obj.status == 'approved':
        #         acct_app.status = ApplicationStatus.PENDING_USER_AGREEMENT
        #         loan_agmt_doc_obj = create_loan_agreement_document(
        #             account_application=acct_app,
        #             loan_verdict_ai_obj=loan_verdict_obj,
        #         )
        #         acct_app.save()
        #         return loan_verdict_obj, loan_agmt_doc_obj
        #     # Else set status to rejected
        #     elif loan_verdict_obj.status == 'rejected':
        #         acct_app.status = ApplicationStatus.REJECTED
        #         acct_app.save()
        #         return loan_verdict_obj, None

        # else:
        #     return 'Error creating LoanVerdictAI object, all required files uploaded by user...check gpt api'
        # # ===========================IN PROGRESS================================

    # Else return all file type names and their date values, to track completed/missing file data
    else:
        return check_aggregate_satisfied_month_intervals(
            acct_app=acct_app,
            file_type_names=LOAN_FILE_TYPE_NAMES_REQUIRED,
        )


# Generate updated file name based on gpt data extraction
def create_friendly_file_name(doc: UploadDocument) -> str:
    """
    Create a friendly file name so that everyone can understand  exactly what it is.
        - example: BBVA_Bancomer-checking-bank_statement-2025-12-01.pdf
    """
    if not doc.file_type_name or doc.friendly_file_name:
        return doc

    data = doc.extracted_data
    if data:
        if doc.file_type_name == "bank_statement":
            doc.friendly_file_name = "-".join([
                doc.file_type_name,
                data.get("bank_name"),
                data.get("date_range_start"),
                data.get("date_range_end"),
            ])

        elif doc.file_type_name == "cashflow_statement":
            doc.friendly_file_name = "-".join([
                doc.file_type_name,
                data.get("date_range_start"),
                data.get("date_range_end"),
            ])

        elif doc.file_type_name == "income_statement":
            doc.friendly_file_name = "-".join([
                doc.file_type_name,
                data.get("date_range_start"),
                data.get("date_range_end"),
            ])

        elif doc.file_type_name == "balance_sheet":
            doc.friendly_file_name = "-".join([
                doc.file_type_name,
                data.get("date_range_end"),
            ])
        elif doc.file_type_name =='constancia_de_situacion_fiscal':
            doc.friendly_file_name = "-".join([
                doc.file_type_name,
                data.get("date_range_end"),
            ])
        # if doc.friendly_file_name:
        #     doc.friendly_file_name += '.pdf'  # file ext

        doc.save()

    return doc


# Create loan agreement function
    # takes around 1min to run for < 5 files, will grow as file reqs grow
def create_loan_agreement_document(
    account_application: AccountApplication,
    loan_verdict_obj: LoanVerdict,
):
    """
    Create a LoanAgreementDocument object and link to the user's
    account application.

    The LoanAgreementDocument object includes metadata as well as
    the actual file the user will need to e-sign to finalize the loan.
    """

    # Create a basic loan agmt doc, just link the acct app for now
    loan_agmt_doc_obj = LoanAgreementDocument.objects.create(
        account_application=account_application,
    )

    # Create a loan agmt pdf generator, pass in the loan verdict ai obj to create the pdf file content in bytes
    loan_agmt_pdf_generator = LoanAgreementPDFGenerator(
        loan_verdict_obj=loan_verdict_obj,
    )

    # Create and link the pdf file to the loan agmt doc
    loan_agmt_pdf_file = loan_agmt_pdf_generator.attach_pdf_bytes(
        doc=loan_agmt_doc_obj,
    )

    return loan_agmt_doc_obj

