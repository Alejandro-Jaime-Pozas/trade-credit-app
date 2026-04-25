# Setup

Postgres DB accessed via Django/Python ORM


# v1 Models

- User
  - first_name
  - last_name
  - email
  - created_at
  - organizations m2m
- Organization
  - name
  - email_domain
  - created_at
  - users m2m
- Customer
  - name
  - legal_name
  - rfc
  - address
  - type: personal moral/fisica
  - created_at
  - updated_at
  - created_by FK User
- CustomerContact
  - first_name
  - last_name
  - email
  - phone
  - role
  - customer FK
  - created_at
  - updated_at
  - created_by FK User
- CreditCase
  - status (missing docs, pending ai verdict, pending final verdict, complete, etc)
  - verdict (approved, rejected, pending)
  - requested_amount
  - requested_term_days
  - created_at
  - updated_at
  - submitted_at
  - verdict_at
  - assigned_to FK User
  - customer FK
- UploadDocument
  - file
  - file_type (CSF, Acta, etc)
  - uploaded_at
  - uploaded_by FK User
  - customer FK null
  - credit_case FK null
- DocumentDataExtract
  - raw_json
  - confidence_score
  - model_version (AI model used to extract data)
  - created_at
  - upload_document FK null
- Label
  - name (ie. sucursal)
  - value (ie. Mty Nte)
  - credit_case FK null
  - customer FK null

## v2 New Models

- Membership
  - role
  - user FK
  - organization FK
- CreditVerdictAI
  - verdict (approved, rejected, pending, etc)
  - status (pending, processed) # will include this separate to verdict since this measures completion
  - explanation
  - model_version (AI model ver used)
  - created_at
  - processed_at
  - credit_case FK
- CreditAccount (Once credit case complete and approved)
  - amount
  - term_days
  - assigned_to FK User
  - created_at
  - updated_at
  - customer FK


# ERD


# Reference

### Best structure for document/files relationship to other models
class Document(models.Model):
    file = models.FileField(...)

class DocumentLink(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE)
    credit_case = models.ForeignKey("CreditCase", null=True, blank=True, on_delete=models.CASCADE)
    customer = models.ForeignKey("Customer", null=True, blank=True, on_delete=models.CASCADE)

    document_type = models.CharField(max_length=50)  # CSF, Acta, Financials, etc.
    uploaded_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True)
