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
- Label (a user-defined dynamic custom field DEFINITION, e.g. "sucursal" — holds no value itself)
  - name (ie. sucursal)
  - organization FK
  - content_type FK (contenttypes.ContentType; the single model this field applies to, e.g. CreditCase)
  - created_at
  - created_by FK User
  - unique_together: (organization, content_type, name)
- LabelValue (the per-object value of a Label, e.g. sucursal="Mty Nte" on a specific CreditCase)
  - label FK Label
  - content_type FK (contenttypes.ContentType; denormalized, always == label.content_type)
  - object_id (PositiveBigIntegerField; generic FK target, together with content_type)
  - value (ie. Mty Nte)
  - created_at
  - updated_at
  - created_by FK User
  - unique_together: (label, content_type, object_id) — enforces one value per label per object
  - labelable models (all expose a `label_values` GenericRelation): CreditCase, Customer, UploadDocument

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
