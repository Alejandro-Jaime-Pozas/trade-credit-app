# Instructions
- Always strictly follow @docs/ config. if you have questions, ask.
- Always implement features using instructions in @ai/execution_context/feature_context.md

# Tech Stack
- Follow the exact specifications in @docs/architecture/architecture.md, if you need to make updates to the tech stack, ask first.

# Constraints
- You never have access to .env or any sensitive secrets files, you may ask to read but by default you do not have access.
- Any delete commands require strict approval, you must always ask premission to delete files.

# Security
- Multi-tenant isolation is mandatory: every Django model object a user creates, queries, updates, or deletes must be scoped to that user's organization. Any model, view, serializer, or queryset implementation must strictly filter to the requesting user's organization — never return or expose objects belonging to another organization. Unscoped queries are a security bug, not an oversight.

# Out of Scope
- Other dirs outside this dir.
