# WORKFLOW IMPLEMENTATIONS FROM SOL BANK PROJECT

## FULL LOAN DECISION PROCESS ORDER

1. KYC/AML
   - if not cleared, reject
2. Credit Risk Analysis
   - if doesn't meet min reqs, reject
3. Loan Terms Analysis
   - if ROI not good enough, reject

## CORE LOAN APPLICATION WORKFLOW

### High-Level Bank Account Opening Process
1. prospect applies to open a Checking acct
2. bank processes application (ask user for docs, get other docs as well)
3. bank approves/disapproves Checking acct for prospect based on application processing results
4. prospect becomes customer, new Checking acct created
5. customer deposits money into the Checking acct via other bank (mock for now)
6. customer applies to open a loan acct
7. bank processes application (ask user for docs, get other docs as well)
8. bank approves/disapproves Checking acct for prospect based on application processing results
9. customer becomes loan customer, new loan acct created

## LOAN APPLICATION AUTOMATION PROCESS

### Initial Version Process
1. feed 1 cash flow pdf file to gpt api
2. get structured json response
3. input json response fields into Application or similar model
4. output result to frontend for user to view or via email

### Document Upload and Processing Flow
1. User uploads file(s) to gpt, get json response based on our created model which outputs fields specifically designed to give the prospect a loan verdict and its details if approved
2. json response gets stored in a model created by us (application model??)

### Complete Loan Origination Process
- applicant submits loan application
  - their personal info: name, email, minimal needed
  - their company info: mostly docs? rfc, stmts, acta, etc
- django waits to get all docs required (need some sort of validation to proceed with most minimal data reqs for application to be processed)
- django stores and analyzes the data/docs using AI tools
- if score not high enough
  - loan rejected
- if score high enough
  - django outputs a loan contract agreement to send user, score, detailed report for mgmt if needed (will help initially to cross-reference)

## USER WORKFLOW FROM SIGNUP TO LOAN

1. user goes to our website
2. user signs up
3. user logs in
4. user clicks on apply for business loan
5. user fills out required information
6. user uploads required documents

### Document Upload Details
- user clicks on 'get your loan/apply for a loan'
- user gets a form with all required data
- user can upload files directly - just click, search for their file, and upload
- we validate the file actually corresponds to a required file type
- we validate the data is correct/what we're looking for
- once good, register internally, and show bright green checkmark to user that this file is completed, show files/data missing

## APPLICATION PROCESSING WORKFLOW

### Process Once User Signed Up
1. Prospect submits loan application with all docs required
2. Backend triggers gpt to analyze all docs
   1. provide clear decision to approve/reject loan
   2. Provide loan offer terms ready to be sent to prospect

### Detailed GPT Processing Flow
- check if AccountApplication ready to be sent to AI
- extract cash flow stmt from AccountApplication, include in request to gpt api
- receive gpt api response, insert into json response into pydantic model schema to ensure data integrity
- pass pydantic model field data as-is into django LoanVerdictAI model fields to create new instance

### Application Lifecycle
While application is live:
- user creates application
- user uploads all req data
- triggers gpt request
- gpt response good/bad, if good continue (else set application status to rejected and end process)
- send user agreement for user to sign
- user signs
- set application status to approved, create acct, loan acct

## FILE PROCESSING WORKFLOW

### File Upload to GPT Process
1. find correct way to feed pdf file as input to gpt
2. add file feed code (and output) to backend code somewhere in integrations
3. modify/add file upload code to backend

### File Naming and Data Extraction
>> user uploads random file
>> django saves file (with original filename and other limited fields, fill rest later)
>> django sends request to gpt api to fill out filename and extract important metadata fields (dates, names, etc)
>> django gets gpt response, changes the file's filename, stores fields in extracted_data
>> frontend fetches django data and shows to user new filename based on file data

### Two-Step GPT File Analysis
1. extract the file_type_name (use files required to choose best fit)
2. extract the date_range: start_date + end_date, or just end_date if no range
3. then go to specific file types, based on the name extracted

### File Validation Process (What GPT Should Do)
- file verification analyzer
  - confirming if the correct file was uploaded, if not ask for the correct required file
- fraud detector/KYC analyzer
  - determining if more information is required or if data seems suspicious
- financials analyzer
  - determining the loan to give out based on the data

## LOAN AGREEMENT AND ACCOUNT CREATION

### Post-Approval Process
1. loan verdict ai responds with loan approved
2. triggers creating a pdf file internally with loan verdict ai data as part of input
3. file created, triggers creating LoanAgreementDocument obj with file as file

### User Signing Process
- once loan verdict is approved, await user to 'sign' (just click accept button)
- triggers changing the status of application to 'user-accepted'
- once that happens trigger creating the account
- pass application data into account, leave app as is, nothing changes, state left as it ended
- now acct is the 'live' object

### Complete Loan Creation Flow
1. user completes file uploads for application
2. triggers gpt verdict
3. if approved triggers sending user loan agreement pdf doc
4. user signs loan agreement
5. loan acct is created

## DOCUMENT REQUIREMENTS AND VALIDATION

### Bank Statement Requirements
- last 12 months of data for each bank checking acct they have
  - if business active less than 12 mths, then all data they have since start
    - if active 3 months or less, reject
  - if some months within the 12 month period missing
    - flag the missing months to remind user to upload those files
- must include ALL BANK ACCOUNTS THE PYME HOLDS
  - create short online contract/signature for user to confirm those are all the bank accts

### File Processing Per Upload
1. User uploads file to app (loan)
2. Document is created, linked to loan app, with file type name
3. logic checks if file type name in missing files, if so, uploads and adds to uploaded files, removes from missing files, checks if all files have been uploaded

## CURRENT IMPLEMENTED WORKFLOW (V2)

### Multi-File Upload Process
1. user uploads last required file
2. uploaddoc created
3. uploaddoc serializer/view checks if this is last required file
4. if true:
   1. triggers gpt analysis process given all file content
   2. records json response into a loan verdict ai obj
   3. if loan approved by gpt response is true:
      1. creates a loan agmt obj which contains a pdf file for user to sign

### Data Models Relationship Flow
User >> Company >> AccountApp >> Checking/LoanAcctApp >> Account >> Checking/LoanAccount

### Account and Loan Account Creation
- creating an acct app of type 'loan' ALSO creates a loan acct app linked to that acct app
- pass in the loan acct app into the gpt process to enable creating the loanverdictai obj

## DATE VALIDATION WORKFLOW

### File Date Validation
A doc is considered complete if:
- At least 1 UploadDocument with required file_type_name has been submitted
- All date ranges for that doc have been submitted

### Date Checking Process
1. grab all bank stmt file_type_name files for this acct app
2. extract the start and end dates for each
3. once 12 consecutive months in t-14 timeframe posted, file reqs are complete

### Hard Constraints for Dates
- most recent date must be no older than 2 months prior (if March, then at least data until January)
- must have 12 months of data if income stmt, cashflow, or bank stmt
- balance sheet no constraints except for recent date

## RFC AND CREDIT BUREAU INTEGRATION

### CSF Processing
1. Add CSF Constancia de Situacion Fiscal as a required loan doc
2. Contains the RFC, which will be extracted from file via gpt process
3. RFC will be used to get a buro de credito pdf report (or mock API data with gpt)
