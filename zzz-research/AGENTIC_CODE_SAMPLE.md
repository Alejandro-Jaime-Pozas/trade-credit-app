Cool — I’ll walk you through a realistic “agent contract” setup for building a full-stack CRM, and show how the stored artifacts (role + constraints + success + failure + tools + stop conditions) actually get used day to day.

Below is an example repo layout + the exact kinds of files great agentic devs keep. Then I’ll run a sample feature from start → shipped.

Repo layout for a CRM with agent contracts
/ai
  /agents
    planner.md
    backend.md
    frontend.md
    db.md
    reviewer.md
    qa.md
  /workflows
    feature.md
    bugfix.md
    refactor.md
/docs
  architecture.md
  decisions/
src/...


Key idea: agents are stable; workflows orchestrate them; features create ephemeral specs in /docs or /tickets.

The “structured bundle” in action
1) Agent contract: /ai/agents/planner.md

This is your “staff engineer / tech lead” agent.

Role definition

Break the request into steps, identify dependencies, propose milestones.

Operating constraints

Must align with docs/architecture.md

Minimize new dependencies

Keep MVP scope tight

Success criteria

Produces: (a) data model changes, (b) endpoints, (c) UI pages/components, (d) acceptance tests

Failure behavior

If requirements ambiguous, list assumptions + ask 2–3 targeted questions OR propose best defaults and label them clearly.

Allowed tools

Repo search/reading, but no code edits (planner only).

Stop conditions

Stop after producing a plan + checklist. Do not start implementing.

That one file becomes the reusable “planning brain” for every feature.

2) Agent contract: /ai/agents/db.md

Role

Design schema, migrations, indexes, and query patterns.

Constraints

No breaking migrations without a backfill plan

Must add indexes for any query used in lists/search

Must preserve tenant isolation (if multi-tenant)

Success criteria

Migration script + rollback notes

Updated ERD snippet in /docs/architecture.md (or /docs/data-model.md)

Seed data updates if needed

Failure behavior

If table ownership unclear, stop and ask (don’t invent tables).

Allowed tools

Modify schema/migrations only

Stop

Stop after migrations + docs update.

3) Agent contract: /ai/agents/backend.md

Role

Implement API + business logic.

Constraints

Input validation required

Auth required on all routes

No “magic” assumptions: must reference existing patterns in repo

Success criteria

Endpoints implemented

Unit/integration tests added

OpenAPI / route docs updated

Failure behavior

If API contract is unclear, stop and ask OR propose a contract and mark it “Proposed”.

Allowed tools

Edit backend code, run tests

Stop

Stop when tests pass and you’ve summarized changes.

4) Agent contract: /ai/agents/frontend.md

Role

UI flows, forms, tables, empty states.

Constraints

Use design system components

Handle loading/error/empty

Keep components small + composable

Success criteria

Feature fully usable end-to-end

UI tests if your stack supports them

Accessibility basics (labels, keyboard nav)

Failure behavior

If API not ready, mock typed client and proceed

Allowed tools

Edit frontend code, run lint/tests

Stop

Stop after UX checklist passes.

5) Agent contract: /ai/agents/reviewer.md

This is your “AI reviewing AI” safety net.

Role

Review diffs as a staff engineer.

Constraints

Prefer simplicity

Flag security issues, tenancy leaks, missing validation

Look for dead code / inconsistent patterns

Success criteria

Produces actionable review bullets

Calls out risky spots with file+line pointers

Failure behavior

If unsure, say so; don’t pretend.

Stop

Stop after review.

Now let’s build one CRM feature, start to finish
Feature request

“Add Contacts to the CRM: list/create/edit contacts, attach them to an Account, and allow search by name/email.”

We’ll run the workflow using your stored “agent contracts.”

Step A — Create an ephemeral feature spec

You (human) write a small spec file:

/docs/features/contacts.md

Intent

Scope (MVP)

Non-goals

Acceptance criteria

Edge cases

Notes on auth/tenancy

This is what you store per feature.

Example acceptance criteria:

Can create a contact with firstName, lastName, email, phone, accountId

Contact list paginates and filters by q=... (matches name/email)

Prevent duplicate email within same tenant

Audit fields: createdAt/updatedAt, createdBy

Step B — Planner agent produces the implementation plan

You run /ai/agents/planner.md with the feature spec.

Planner output (typical):

DB: contacts table + indexes + unique constraint (tenant_id, email)

API:

GET /contacts?q=&accountId=&page=

POST /contacts

GET /contacts/:id

PATCH /contacts/:id

Frontend:

Contacts list page (table, search input)

Contact form (create/edit)

Account detail page: “Contacts” tab showing related contacts

Tests:

Backend: validation, auth, unique email constraint

Frontend: form validation, empty state

Rollout:

Migrate, seed dev data, ensure permissions

Planner stops. No code yet.

What you store? Not the conversation — just the updated spec/plan if useful.

Step C — DB agent implements schema + migration

DB agent gets:

plan section (DB)

repo constraints

DB agent outputs:

migration file

schema update

adds index for:

(tenant_id, account_id)

(tenant_id, lower(email)) or equivalent

search strategy: maybe trigram/full-text if needed later (but MVP might do ILIKE)

DB agent stops.

Step D — Backend agent implements endpoints + tests

Backend agent gets:

API contract (from planner)

schema knowledge

constraints (auth, validation)

Backend agent:

adds routes + handlers

implements search logic safely

ensures tenant scoping everywhere

adds tests: unauthorized, validation errors, duplicate email, pagination

Backend agent runs tests and stops when green.

Step E — Frontend agent builds UI

Frontend agent gets:

routes available

UI requirements

design constraints

Frontend agent:

builds list + search

create/edit form

wires to API client

adds empty/loading/error states

ensures form validations (email format, required fields)

Runs lint/tests.

Step F — Reviewer agent reviews the diff set

Reviewer agent scans PR diff and produces bullets like:

“Search query uses OR without parentheses → potential bug”

“PATCH allows updating accountId but no permission check”

“Missing index for contacts list by account”

“Frontend doesn’t debounce search; might spam API”

Then you fix those issues (maybe with the relevant agent).

Step G — QA agent creates a “verification script”

QA agent outputs:

manual test checklist

API curl examples

edge-case tests (duplicate emails, tenant isolation)

perf smoke check (list 10k contacts?)

You run through it.

The meta-point: what’s stored vs what’s ephemeral?
Stored (durable)

/ai/agents/*.md (your contracts)

/ai/workflows/*.md (your orchestration)

/docs/architecture.md decisions

Ephemeral

/docs/features/contacts.md

“run logs” from the agent (optional; sometimes saved to PR description)

A copy/paste “feature workflow” message (what you’d actually run)

When you trigger the workflow, your “feature.md” might instruct:

Run Planner with docs/features/<x>.md

Run DB agent on migrations only

Run Backend agent + tests

Run Frontend agent + lint/tests

Run Reviewer agent

Run QA agent

This turns “prompting” into a repeatable pipeline.

If you tell me your preferred stack (e.g., Next.js + Node/Express + Postgres, or Rails, Django, Laravel, etc.), I’ll make this even more concrete by writing:

a complete set of /ai/agents/*.md files tailored to it, and

a sample /docs/features/contacts.md that you can reuse as a template.
