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
- FileType (one kind of document the app recognizes, e.g. "bank_statement" — DB mirror of core/file_type_catalog.py)
  - key (ie. bank_statement; IMMUTABLE — it is the value stored in UploadDocument.file_type_name)
  - label_en, label_es (display names; these are what gets renamed, never the key)
  - category (financial | legal | other — decides how recent a document must be to count)
  - months_required (null = one document is enough regardless of period)
  - is_active
  - organization FK null (NULL = app-provided/global, visible to every org; set = that org's own type)
  - created_at
  - created_by FK User null
  - unique_together: (organization, key)
  - PLUS a partial unique index on (key) WHERE organization IS NULL — the constraint above cannot
    cover the global rows, because Postgres treats two NULLs as distinct values
- RequirementTemplate (an organization's reusable list of documents to ask for on a credit case)
  - name (ie. Default)
  - is_default (the template applied automatically to new credit cases)
  - organization FK
  - created_at, updated_at
  - created_by FK User null
  - unique_together: (organization, name)
  - PLUS a partial unique index on (organization) WHERE is_default — one default per org
- RequirementTemplateItem (one document type listed in a template)
  - template FK RequirementTemplate
  - file_type FK FileType (PROTECT)
  - is_required (False = shown as optional, never blocks completion)
  - months_required null (overrides FileType.months_required for this template)
  - order
  - unique_together: (template, file_type)
- CreditCaseRequirement (one document a SPECIFIC credit case needs — a per-case snapshot)
  - credit_case FK CreditCase (related_name='requirements')
  - file_type FK FileType (PROTECT)
  - is_required
  - source (template | manual — 'manual' rows are per-case additions a re-sync never touches)
  - source_template FK RequirementTemplate null (which template it was copied from)
  - months_required null
  - created_at
  - synced_at null (when a template re-sync last added/changed this row)
  - created_by FK User null
  - unique_together: (credit_case, file_type)
  - NOTE: deliberately a COPY of the template rather than a FK to it, so editing a template later
    cannot rewrite what an already-reviewed credit case was required to provide

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
