# Instructions
- Always strictly follow @docs/ config. if you have questions, ask.
- Always implement features using instructions in @ai/execution_context/feature_context.md
- Always follow the principle of least privileges
- Always build simple, lean, modular code, don't introduce complexity from the beginning

# Tech Stack
- Follow the exact specifications in @docs/architecture/architecture.md, if you need to make updates to the tech stack, ask first.

# Constraints
- You never have access to .env or any sensitive secrets files, you may ask to read but by default you do not have access.
- Any delete commands require strict approval, you must always ask premission to delete files.

# Security
- Multi-tenant isolation is mandatory: every Django model object a user creates, queries, updates, or deletes must be scoped to that user's organization. Any model, view, serializer, or queryset implementation must strictly filter to the requesting user's organization — never return or expose objects belonging to another organization. Unscoped queries are a security bug, not an oversight.

# Documentation
- Docstrings and comments should make a piece of code's purpose clear enough for a beginner coder with limited experience to understand it.
  - Always required: Django models (every model and field's purpose), complex code (non-obvious logic, multi-step or non-trivial behavior), and code that wraps/uses external packages (why the package is used and what it's doing).
  - Not required: simple, self-explanatory functions.

# Testing
- Any code implementation that warrants tests shall implement those tests, run them, and verify they pass after the code is implemented, always.

# Frontend Workflow
- Frontend work happens in a git worktree on port 3001, never in the main tree. The main tree's `next dev` hot-reloads every saved file straight into the browser on port 3000, so editing `frontend/` here makes the app unusable for whoever is using it.
- Start with `make ui-start` (creates `../trade_credit_app-ui` on branch `ui/work` and serves it on 3001). Edit only files under that worktree. Check your work at http://localhost:3001.
- Publish with `make ui-publish` from the main tree, only once the work is finished and its tests pass. That merges the branch and lets port 3000 pick the change up in one shot. Never merge partial work.
- `make ui-start` refuses to run if the main tree is dirty. A worktree branches from committed state only, so uncommitted edits would be silently missing from it. Commit first — do not work around this.
- The preview has NO backend of its own: it talks to the backend the main stack runs on port 8000, sharing one database. Backend code edited in the worktree therefore does nothing until merge. Do backend changes in the main tree first, then the UI in the worktree.
- Ask before running `make ui-clean` — it removes the worktree.

# Out of Scope
- Other dirs outside this dir.
