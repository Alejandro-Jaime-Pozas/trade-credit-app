# CONTEXT

There is nothing in the main `frontend/` folder, you must build the frontend yourself.

I need you to build out the frontend for the trade_credit_app application.

The backend and the database execution are in the docker-compose.yml file in the root directory, add whatever you need to the docker-compose.yml file to get the frontend running after the backend and database are running. If anything needs to be added to the django project for the frontend to work, add it. this is all in dev mode for now, not production level.

Backend django rest framework code already exists

## Feature Name
Initial frontend sign up and basic user pages.

## Description
This allows the user to create an account, sign in, then view a dashboard of their org's credit cases, as well as allowing the user to create and modify any credit cases, customers, customer contact information, including uploading related files to the credit case. Basic intial crud ops for user and web pages.

## Scope
Initial:
    - signup,
    - login,
    - dashboard view for all credit cases,
    - create customer + customer contact + credit case,
    - detail page for customer + customer contact + credit case (Update, Delete)

## User Story

### Signup Workflow

- user: types email, pwd
- backend: new user created
- user: clicks log in, types credentials
- backend: logs user in
- backend: sets the organization to the user's email for now (implement later)

### Credit Case Workflow

- user creates customer profile
  - fields
    - can (later) be extracted from docs like constancia CSF or
    - rfc
    - nombre comercial
    - address
- backend auto-create credit case/record linked to the customer profile
- user uploads docs to credit case detail view
- backend analyzes docs, extracts data, identifies doc type, extracts relevant required data, checks if file and data requirements satisfied
- user can change credit case/record status (missing data, pending credit review, pending authorization)

### Auth and Permissions

- user default is admin for now, no RBAC for now (implement later)
- user creates account
  - plain email (implement Google auth, Microsoft auth later)
- user logs in
- user logs out

### Frontend UI Views

- dashboard view
  - includes rows of credit cases, status, start date among other important columns
  - users can filter rows by status, date, etc
- create credit case view (user can create a new customer (create customer view) or select from their existing customers via lookup)
  - user can add/update credit case fields
  - user adds/updates internal customer credit request fields: amount, term (net 30/45/60, etc)
  - user can upload new customer files
    - then (later) backend extracts the file type, useful data for credit evaluation
    - files: CSF, Acta Const, Bank Stmts, Financial Stmts, Poderes Notariados, ID oficial, comp domicilio
  - user can modify strict requirements to consider solicitud as complete
    - for example, this customer requires: acta, csf, comprobante domicilio, *optional current 12 month cashflow stmt
- create customer view
  - allow user to (optionally) upload the constancia CSF to extract customer details first for faster extraction/less errors
  - let user fill out fields as well
  - fields: rfc, nombre comercial, address, etc
- customer detail view (customer already created)
  - user can update customer profile fields
  - fields: rfc, nombre comercial, address, etc
  - user can change a customer's files (acta constitutiva, csf)
- credit case detail view (credit case already created)
  - user can update fields, files, requirements for completion
    - files: CSF, Acta Const, Bank Stmts, Financial Stmts, Poderes Notariados, ID oficial, comp domicilio

## Constraints
- You can only modify the `frontend/` and `logs/` folders.
- Follow best practices, keep code simple and modular
- no RBAC yet, any new user is admin by default
- no credit evaluation analysis yet
- business customers (personas morales) only, implement personas fisicas later
- no data extraction process from backend for now
