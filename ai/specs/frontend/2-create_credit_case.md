# Feature Implementation Template

## Feature Name
Create credit case and Customer workflow

## Instructions
Strictly adhere to @docs/ for tech stack and architecture implementations.

## Description
This feat lets a logged in user create a new credit case, which is linked to a specific customer, and subsequently add details to that credit case, such as the trade credit amount, term, associated files to that credit case, etc.

## User Story
- user clicks on create new credit case
- user creates new customer profile to link to new credit case (or links to existing customer)
  - Customer model fields in form
    - filled out manually by user in v1
      - can (later) be extracted from docs like constancia CSF
    - key fields
      - rfc
      - legal name
      - name
      - address (multiple address fields in Customer model)
- backend auto-create credit case linked to the customer profile
- credit case default required files specified in @backend/core/constants.py as CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED
  - user can input/update fields for created credit case
    - requested_amount
    - currency
    - requested_term_days
    - assigned_to
- user uploads files (UploadDocument model) to credit case detail view (can bulk load, or single load)
  - this uploads the file to UploadDocument @backend/storage/models.py, linking the file to customer and credit case
    - file has no link yet to a specific file type name required
- backend extracts the file contents to match the file type with a required file type if exists, else marks as unknown file type (this requires the openai/chatgpt integration in @backend/integrations/openai/services/gpt.py to extract the correct file type name)
- user can then change credit case status as it progresses (missing data, pending credit review, pending authorization), upload more files, change credit case model data

## Constraints
- You may only modify the @frontend/ dir
- do not modify the backend dir
- Use @docs/ for additional constraints

## Out of Scope
- backend dir
- database
- direct auth modifications
