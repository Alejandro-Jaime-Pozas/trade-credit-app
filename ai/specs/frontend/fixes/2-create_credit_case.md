# Code Fixes Template

## Related File
@ai/specs/frontend/features/1-frontend_init.md

## Implement
- customer is created from new credit case using only customer name (change 'Nombre Comercial' to 'Name')
- make the UI more intuitive and user-friendly so the user knows that they are creating a new credit case, but in order to do so, they need to create or link the new credit case to a customer first
  - to help with this, step 1 should be to create or link the new credit case to a customer, so only show customer create or link part, once that is done and user confirms link to a customer, show the create new credit case part so customer can input those details
  - Here are the exact instructions to follow:
    1. user clicks create new credit case
    2. new credit case page shows user "To create a new credit case, first search for a customer or create a new customer" and new credit case fields are hidden throughout until the user creates or links to customer
    3. new credit case page shows search existing customers (or create new after searching) in friendly way
       1. allows user to search, and if not exists, then create new customer with their input
    4. the only required field that appears to create new customer is customer name (just name not legal_name field)
       1. (TODO later allow user to choose default required fields for new customer)
    5. under input customer name, text shows **(show more fields)** so user can input those as well, but they are hidden by default since only the customer name should appear by default
      - those show more fields should be the ones included in customer serializer:
        - rfc
        - legal_name
        - address fields
    6. user clicks create new customer button
    7. new credit case page now shows new customer created pop-up/alert, and shows fields to create new credit case
       1. fields:
          1. requested_amount
          2. requested_currency
          3. requested_term_days
    8. user clicks create credit case
    9. new credit case created pop-up/alert shows, redirect to credit cases overview page (these should be)
  - also, i want the http://localhost:3000/credit-cases page to show the latest updated_at credit case first on top, which should now be ordered given the drf view queryset, but it isn't working so fix.


## Constraints
- You may only modify the @frontend/ dir
- do not modify the backend dir
- Use @docs/ for additional constraints
- Ignore any TODO sections from the implementation content above.

## Out of Scope
- backend dir
- database
- direct auth modifications
