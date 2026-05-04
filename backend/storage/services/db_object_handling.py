"""
Handle any object operations not directly related to drf implementations.
"""


from storage.services.loan_term_handling import (
    create_loan_verdict_obj,
    run_buro_de_credito_process,
)
from integrations.buro_de_credito.json_response_sample import json_response
from processing.services.credit_case import (
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
    CreditCase,
    LoanAgreementDocument,
    LoanVerdict,
    LoanVerdictAI,
)
from processing.choices_for_models import (
    CreditCaseFinalVerdict,
    CreditCaseStatus,
)
from integrations.openai.services.gpt import GPTService


def handle_upload_document_created(doc):
    """
    1. Extract important file data using gpt for later use and to
    show user a friendly name for their file.
    """

    # Get UploadDocument's related account application
    credit_case = doc.credit_cases.first()  # TODO may need to modify later since vague (but usually only one credit_case while user creating/uploading files)
    if not credit_case:
        raise ValueError('UploadDocument must have a related CreditCase obj.')

    # If credit_case has been rejected, skip gpt analysis and return the credit_case
    if credit_case.status == CreditCaseStatus.REJECTED:
        return credit_case

    # Run gpt to update the doc's file_type_name, extracted_data
        # if file_type_name in required docs, then credit_case will pick it up automatically
    GPTService(credit_case).run_gpt_file_data_extraction(doc)

    # Update the doc's friendly file name: include file_type_name, gpt file dates
    doc.refresh_from_db()
    create_friendly_file_name(doc)

    # Get the doc's file_type_name
    file_type_name = doc.file_type_name
    if not file_type_name:
        return f'UploadDocument should have a file_type_name field from gpt process.'

    # If file_type_name is Const de Situacion Fiscal, run credit process
    if file_type_name == 'constancia_de_situacion_fiscal':
        verdict = run_buro_de_credito_process(doc=doc, credit_case=credit_case)

        # If verdict for credit process = failed, terminate the credit_case's lifecycle, set status of credit_case to REJECTED, reject the loan applicant based on credit score
        if verdict['passed'] == False:
            credit_case.status = CreditCaseStatus.BURO_DE_CREDITO_REJECTED
            credit_case.save()
            print('Credit score did not pass minimum threshold.')
            return verdict['bdc_report_obj']  # BuroDeCreditoReport obj

    # Get the loan_credit_case and loan_verdict
    loan_credit_case = credit_case.loan_credit_case
    loan_verdict_obj = loan_credit_case.loan_verdicts.order_by('-id').first()  # grab latest

    # If a related loan verdict obj already exists, skip openai process
    if loan_verdict_obj:
        print('\nloan_verdict obj already exists, skipping openai process.', loan_verdict_obj)
        return loan_verdict_obj

    # Get the missing file type names and their missing dates (if any) to check date range completion
    credit_case_docs_are_completed = check_all_files_required_dates_complete(
        credit_case=credit_case,
        file_type_names=LOAN_FILE_TYPE_NAMES_REQUIRED,
    )
    print('\ncredit_case req docs are complete:', credit_case_docs_are_completed)  # TEMP
    print(credit_case.all_files_required_dates_complete)  # TEMP
    # pretty_print(credit_case.all_files_required_dates_complete)  # TEMP not working

    # # If no missing file type names in application and no missing dates, change its status to pending review, run loan analysis process
    # if credit_case.total_missing_files == 0 and credit_case_docs_are_completed:
    #     credit_case.status = CreditCaseStatus.PENDING_INTERNAL_REVIEW
    #     credit_case.save()

    #     # Create loan verdict db obj with loan terms
    #     loan_verdict_obj = create_loan_verdict_obj(credit_case=credit_case)

    #     # If loan verdict approved, change credit_case status to pending user agreement, and create the user loan agreement document, link it to the credit_case
    #     if loan_verdict_obj:
    #         if loan_verdict_obj.status == 'approved':
    #             credit_case.status = CreditCaseStatus.PENDING_USER_AGREEMENT
    #             loan_agmt_doc_obj = create_loan_agreement_document(
    #                 credit_case=credit_case,
    #                 loan_verdict_obj=loan_verdict_obj,
    #             )
    #             credit_case.save()
    #             return {
    #                 'loan_verdict': loan_verdict_obj,
    #                 'loan_agreement_document': loan_agmt_doc_obj,
    #             }
    #         # Else set status to rejected
    #         elif loan_verdict_obj.status == 'rejected':
    #             credit_case.status = CreditCaseStatus.REJECTED
    #             credit_case.save()
    #             return {
    #                 'loan_verdict': loan_verdict_obj,
    #             }
    #     else:
    #         return 'Error creating LoanVerdict object, all required files uploaded by user...check process.'


    #     # # TODO this is the process that takes a long time, implement celery/redis later and openai api fails/errors
    #     # # ===========================IN PROGRESS================================
    #     # # If account application has all upload_documents submitted, trigger gpt process
    #     # # TODO WILL REPLACE THIS BELOW WITH INTERNAL LOAN ANALYSIS PROCESS...
    #     # GPTService(credit_case).run_gpt_loan_verdict()

    #     # loan_verdict_obj = loan_credit_case.loan_verdicts_ai.order_by('-id').first()

    #     # if loan_verdict_obj:
    #     #     # If gpt process success, change application status to pending user agreement, and create the user loan agreement document, link it to the credit_case
    #     #     if loan_verdict_obj.status == 'approved':
    #     #         credit_case.status = CreditCaseStatus.PENDING_USER_AGREEMENT
    #     #         loan_agmt_doc_obj = create_loan_agreement_document(
    #     #             credit_case=credit_case,
    #     #             loan_verdict_ai_obj=loan_verdict_obj,
    #     #         )
    #     #         credit_case.save()
    #     #         return loan_verdict_obj, loan_agmt_doc_obj
    #     #     # Else set status to rejected
    #     #     elif loan_verdict_obj.status == 'rejected':
    #     #         credit_case.status = CreditCaseStatus.REJECTED
    #     #         credit_case.save()
    #     #         return loan_verdict_obj, None

    #     # else:
    #     #     return 'Error creating LoanVerdictAI object, all required files uploaded by user...check gpt api'
    #     # # ===========================IN PROGRESS================================

    # # Else return all file type names and their date values, to track completed/missing file data
    # else:
    #     return check_aggregate_satisfied_month_intervals(
    #         credit_case=credit_case,
    #         file_type_names=LOAN_FILE_TYPE_NAMES_REQUIRED,
    #     )


# Generate updated file name based on gpt data extraction
def create_friendly_file_name(doc: UploadDocument) -> str:
    """
    Create a friendly file name so that everyone can understand  exactly what it is.
        - example: BBVA_Bancomer-checking-bank_statement-2025-12-01.pdf

    Currently set up to NOT raise errors if some fields are missing. Easier to
    just allow this vs raise error if a doc file is missing one field for now.
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


# TODO maybe replace with a trade credit agreement/contract for user to sign.
# # Create loan agreement function
#     # takes around 1min to run for < 5 files, will grow as file reqs grow
# def create_loan_agreement_document(
#     credit_case: CreditCase,
#     loan_verdict_obj: LoanVerdict,
# ):
#     """
#     Create a LoanAgreementDocument object and link to the user's
#     account application.

#     The LoanAgreementDocument object includes metadata as well as
#     the actual file the user will need to e-sign to finalize the loan.
#     """

#     # Create a basic loan agmt doc, just link the credit_case for now
#     loan_agmt_doc_obj = LoanAgreementDocument.objects.create(
#         credit_case=credit_case,
#     )

#     # Create a loan agmt pdf generator, pass in the loan verdict ai obj to create the pdf file content in bytes
#     loan_agmt_pdf_generator = LoanAgreementPDFGenerator(
#         loan_verdict_obj=loan_verdict_obj,
#     )

#     # Create and link the pdf file to the loan agmt doc
#     loan_agmt_pdf_file = loan_agmt_pdf_generator.attach_pdf_bytes(
#         doc=loan_agmt_doc_obj,
#     )

#     return loan_agmt_doc_obj

