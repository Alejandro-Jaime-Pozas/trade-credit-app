# v1

## Scope

- business customers only, implement personas fisicas later
- no RBAC yet, any new user is admin by default
- no credit evaluation analysis yet
- user should be able to:
  - create acct
  - log in
  - log out
  - add/update/delete customer
  - add/update/delete credit case
  - upload files to customer or credit case
  - view dashboard of credit cases, filter/order by status, days since creation


## Signup Workflow

- user: types email, pwd
- backend: new user created
- user: clicks log in, types credentials
- backend: logs user in
- backend: sets the organization to the user's email for now (implement later)

## Credit Case Workflow

- user creates customer profile
  - fields
    - can be extracted from docs like constancia CSF or
    - rfc
    - nombre comercial
    - address
- backend auto-create credit case/record linked to the customer profile
- user uploads docs to credit case detail view
- backend analyzes docs, extracts data, identifies doc type, extracts relevant required data, checks if file and data requirements satisfied
- user can change credit case/record status (missing data, pending credit review, pending authorization)


## Auth and Permissions

- user default is admin for now, no RBAC for now (implement later)
- user creates account
  - plain email (implement Google auth, Microsoft auth later)
- user logs in
- user logs out


## Views

- dashboard view
  - includes rows of credit cases, status, start date among other important columns
  - users can filter view by status, date, etc
- create customer view
  - allow user to upload the constancia CSF to extract customer details first for faster extraction/less errors
  - let user fill out fields as well
  - fields: rfc, nombre comercial, address, etc
- customer detail view (customer already created)
  - user can update customer profile fields
  - fields: rfc, nombre comercial, address, etc
- create credit case view (auto-created when new customer is created)
  - user can add/update credit case fields
  - user adds/updates internal customer credit request fields: amount, term (net 30/45/60, etc)
  - user can upload new customer files
    - then backend extracts the file type, useful data for credit evaluation
    - files: CSF, Acta Const, Bank Stmts, Financial Stmts, Poderes Notariados, ID oficial, comp domicilio
  - user can modify strict requirements to consider solicitud as complete
- credit case detail view (credit case already created)
  - user can update fields, files, requirements for completion
    - files: CSF, Acta Const, Bank Stmts, Financial Stmts, Poderes Notariados, ID oficial, comp domicilio
