# Trade Credit Web App

## Purpose

This is a full stack web app that allows business users from a given organization to manage their customers' applications for trade credit (net 30/60/90 days), as well as their ongoing trade credit accounts once a case is approved.

Managers can have a great overview of trade credit cases and accounts by tracking their progress and helping their team stay on track.

Business development reps, salespeople, credit analysts, accounts receivable team can use this web app for day-to-day operations. These include:
    - Adding new customers
    - Adding a trade credit case for a given prospect/customer
    - Adding files and related data to a trade credit case
    - Approving or rejecting a trade credit case

## General Workflow

1. User creates a new credit prospect profile (sale has already been made, just missing the trade credit evaluation/confirmation for customer)
  1. RFC, nombre comercial, address, etc (ideally by uploading the CSF)
2. New credit case automatically created for the new credit prospect profile
3. User chooses default requirements needed to complete the credit case, or chooses specific requirements from list
  1. User can always update the default reqs, or do one-time reqs for specific profiles
4. User uploads related docs to credit case, or sends link to customer user email for them to upload docs themselves
5. Backend exracts data from docs, confirms the file type, extracts specific fields given the file type, checks if file content meets requirements
6. User manually adds certain fields like credit amount requested, term (monthly), type (credit line),
7. User can manually add fields if they want, like RFC, name, etc (but the idea is that this is done with AI file data extraction)
8. Once all required docs and data complete, backend triggers credit evaluation process to generate an AI credit verdict
  1. buro de credito/circulo de credito data analysis (persona moral + personas fisicas)
  2. alternative data analysis (if available)
  3. financials analysis (if provided, cashflow ideal for basic analysis)
9. Final credit verdict report provided with recommendation and detailed comments for further analysis.
