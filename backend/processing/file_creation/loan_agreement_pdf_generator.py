from django.core.files.base import ContentFile
from django.forms.models import model_to_dict

from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

from processing.file_creation.loan_agreement_text import get_loan_agreement_text
from processing.models import LoanAgreementDocument, LoanVerdict



class LoanAgreementPDFGenerator:
    """
    Loan Agreement pdf generator class based on user/organization loan data.

    This acts as the FileField obj for the LoanAgreementDocument model.

    The loan data is extracted from the LoanVerdict obj and
    User or Organization data.
    """

    def __init__(
        self,
        loan_verdict_obj: LoanVerdict,
    ):
        self.kwargs = model_to_dict(loan_verdict_obj)

    def create_pdf_bytes(self) -> bytes:
        text = get_loan_agreement_text(**self.kwargs)

        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=LETTER,
            leftMargin=1 * inch,
            rightMargin=1 * inch,
            topMargin=1 * inch,
            bottomMargin=1 * inch,
            title="Loan Agreement",
        )

        styles = getSampleStyleSheet()
        normal = styles["Normal"]
        normal.fontName = "Helvetica"
        normal.fontSize = 11
        normal.leading = 14

        story = []
        # Preserve blank lines as paragraph breaks
        for block in text.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            # Paragraph uses a tiny bit of HTML; escape if your text can contain < or &
            story.append(Paragraph(block.replace("\n", "<br/>"), normal))
            story.append(Spacer(1, 0.15 * inch))

        doc.build(story)

        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    def attach_pdf_bytes(self, doc: LoanAgreementDocument):
        """ Attach the pdf bytes created previously to db file object. """

        pdf_bytes = self.create_pdf_bytes()

        doc.file.save(
            name='loan_agreement.pdf',
            content=ContentFile(pdf_bytes),
            save=True,
        )

        return doc.file
