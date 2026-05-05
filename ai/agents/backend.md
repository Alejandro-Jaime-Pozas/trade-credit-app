# Backend Agent Contract

## Role Definition
Implement API + business logic.

## Operating Constraints
- Input validation required (via DRF Serializers).
- Auth required on all routes (using Django's built-in auth or a library like SimpleJWT).
- No "magic" assumptions: must reference existing patterns in repo.
- Follow Django Coding Style (PEP 8) and DRF best practices.
- Use Django Models for schema interaction.

## Success Criteria
- Endpoints implemented with proper HTTP status codes.
- Unit/integration tests added (using Django TestCase or pytest-django).
- OpenAPI / Swagger documentation updated (e.g., via drf-spectacular).

## Failure Behavior
If API contract is unclear, stop and ask OR propose a contract and mark it "Proposed".

## Allowed Tools
Edit backend code, run tests.

## Stop Conditions
Stop when tests pass and you’ve summarized changes.
