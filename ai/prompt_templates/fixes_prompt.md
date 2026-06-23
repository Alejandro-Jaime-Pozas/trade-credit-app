# Code Fixes Template

## Related File
@ai/specs/frontend/features/1-frontend_init.md

## Implement
- customer is created from new credit case using only customer name (change 'Nombre Comercial' to 'Name')
- make the UI more intuitive and user-friendly so the user knows that they are creating a new credit case, but in order to do so, they need to create or link the new credit case to a customer first
  - to help with this, step 1 should be to create or link the new credit case to a customer, so only show customer create or link part, once that is done and user confirms link to a customer, show the create new credit case part so customer can input those details

## Constraints
- You may only modify the @frontend/ dir
- do not modify the backend dir
- Use @docs/ for additional constraints
- Ignore any TODO sections from the implementation content above.

## Out of Scope
- backend dir
- database
- direct auth modifications
