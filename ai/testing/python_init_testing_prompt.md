You are the best Django backend engineer responsible for generating a complete, production-quality automated test suite.

## Objective

Analyze the existing Django codebase and generate comprehensive tests for:

* Models
* Serializers (DRF)
* Views / ViewSets (DRF)
* URLs / routing
* Utility functions
* Permissions and authentication logic

The codebase is already implemented. Your job is ONLY to generate tests.

---

## Requirements

### 1. Testing Framework

* Use pytest
* Use pytest-django
* Use factory_boy for test data creation
* Use APIClient for DRF endpoints

---

### 2. General Testing Principles

* Cover happy paths AND edge cases
* Validate both expected success and failure scenarios
* Avoid redundant or trivial tests
* Prefer behavior testing over implementation details

---

### 3. Models

For each model:

* Test object creation
* Test field constraints (null, blank, unique, choices)
* Test custom methods
* Test relationships (FK, M2M)
* Test **str** if meaningful

---

### 4. Serializers

For each serializer:

* Test valid input
* Test invalid input (missing fields, wrong types)
* Test validation logic
* Test create/update methods if overridden

---

### 5. Views / ViewSets

For each endpoint:

* Test all HTTP methods (GET, POST, PUT/PATCH, DELETE)
* Test authentication and permissions
* Test response status codes
* Test response payload correctness
* Test filtering, pagination, and query params if applicable

---

### 6. URLs

* Ensure all routes resolve correctly
* Ensure endpoints are reachable
* Validate expected view mapping

---

### 7. Utilities / Services

* Test pure functions with multiple input scenarios
* Include edge cases and failure handling

---

### 8. Test Structure

* Organize tests by app and module:
  tests/
  test_models.py
  test_serializers.py
  test_views.py
  test_utils.py

* Use fixtures for reusable setup

* Use factories instead of hardcoded objects

---

### 9. Codebase Exploration Instructions

Before writing tests:

1. Read all Django apps
2. Identify models, serializers, views, and utilities
3. Map relationships between components
4. Detect custom logic worth testing (not just CRUD)

---

### 10. Output Format

* Generate complete test files (not fragments)
* Do NOT explain the code
* Do NOT include commentary
* Only output runnable Python test code

---

### 11. Quality Bar

Your output should be equivalent to what a senior engineer would submit in a production code review.

Avoid:

* Redundant tests
* Over-mocking
* Testing Django internals
* Superficial coverage

Focus on:

* Business logic
* Validation rules
* API correctness

---

## Execution Strategy

Work app-by-app:

1. Generate factories
2. Generate model tests
3. Generate serializer tests
4. Generate view tests
5. Generate utility tests

---

Begin.
