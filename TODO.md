# CURRENT
- frontend: implement new changes given credit case process, customer, customer contact, check bugs:
  - implement credit case workflow from @docs/versions/v1.md
    - basically, user should create a new credit case, which requires firstly a new/existing customer to link the credit case to
  - implement user requiring certain fields/files to complete customers/credit cases by using labels
    - FOR NOW, JUST WORRY ABOUT LETTING USERS MARK FILES AS REQUIRED/OPTIONAL
      - this could later prove tricky with non-objects. required files is easy, since each is its own obj, but a Customer specific field, such as rfc or legal name, the admin user should be able to choose if it's required..but tricky to use label to mark it as required/optional since it is a field, not an obj, ask ai.

# LATER
- fix credit_case frontend page NOT available since required token auth which did not have previously
- fix handle_doc_created code to link to creditcase or customer instead of old version with acct app...this to allow pydantic models, gpt data extraction...
- automate cursor agents creating test files for new serializers, urls, models, views
  - can recreate all tests from scratch since many errors/old deps
