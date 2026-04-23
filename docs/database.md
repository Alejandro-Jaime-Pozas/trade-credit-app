# Setup

Postgres DB accessed via Django/Python ORM


# v1 Models

- User
  - first_name
  - last_name
  - email
  - created_at
  - organization m2m
- Organization
  - name
  - domain
  - created_at
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
  - customer_id
- CreditCase
  - status
  - requested_amount
  - requested_term_days
  - assigned_to FK User
  - created_at
  - updated_at
  - submitted_at
  - verdict_at
- UploadDocument
  - file
  - uploaded_at
  - uploaded_by FK User
- UploadDocumentLink
  - document_type
  - customer FK null
  - creditcase FK null
  - document FK
- Label

## v2 New Models

- Membership


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
