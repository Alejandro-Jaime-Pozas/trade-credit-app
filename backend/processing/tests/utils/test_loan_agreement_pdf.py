from django.test import TestCase
from django.forms.models import model_to_dict

from processing.file_creation.loan_agreement_pdf_generator import (
    LoanAgreementPDFGenerator,
)
from core.tests.obj_instances_global import (
    test_create_loan_verdict_inst,
)


class TestLoanAgreementPDF(TestCase):
    """ Test creating the loan agreement pdf file. """

    def setUp(self):
        self.loan_verdict_obj = test_create_loan_verdict_inst()

    # test create loan agreement pdf generator success
    def test_create_loan_agreement_pdf_generator_success(self):
        # create loan verdict ai obj, pass into pdf generator
        pdf_generator = LoanAgreementPDFGenerator(self.loan_verdict_obj)
        pdf_bytes = pdf_generator.create_pdf_bytes()

        self.assertIsInstance(pdf_bytes, bytes)
        self.assertIsNotNone(pdf_bytes)

        self.assertEqual(pdf_bytes[:4], b'%PDF')

    # test required kwargs are included in input
    def test_missing_loan_data_kwargs_error(self):
        pdf_generator = LoanAgreementPDFGenerator(self.loan_verdict_obj)

        loan_vrd_dict = model_to_dict(self.loan_verdict_obj)
        required_kwargs = {
            'principal',
            'interest_rate',
            'term',
            'payment',
        }

        for k in required_kwargs:
            loan_vrd_dict_copy = loan_vrd_dict.copy()
            with self.assertRaises(TypeError):
                loan_vrd_dict_copy.pop(k)
                pdf_generator.kwargs = loan_vrd_dict_copy
                pdf_generator.create_pdf_bytes()
