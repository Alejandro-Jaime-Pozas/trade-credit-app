# Prompt Log — v2_pagare_expiry_and_verdict_deadline — 2026-08-31

## Human prompt (verbatim)

> the scope section of 'docs/versions/v2.md' has a few bullet points of things i want to
> implement for this iteration of the codebase.
>
> they're generic on purpose, we'll get into the details later. they mix up frontend/backend
> stuff.
>
> i want to ask you what you think we can realistically accomplish in a couple of days vs what
> we maybe leave for later...i made some bullets with v3 or TODO as suggestions for later
> implementations, but we'll sooner or later need all those implementations. what should we
> keep for v2 and what should we move to v3? disregard my v3 and TODO labels, make your own
> decisions

Then, after the assessment:

> i agree with you, move the v3 bullet points to the v3 file for now, and start implementing
> backend only for the 3 points you mentioned. no frontend changes. go.

## Decisions taken during the work

Asked via AskUserQuestion once the schema change became unavoidable (the feature workflow
requires asking before modifying the database schema):

1. **Host Postgres was holding port 5432**, so the DB container could not start.
   Answer: *"port killed, you may now use it for pg db"* — no docker-compose change made.
2. **Deadline storage shape.** Answer: org default + nullable per-case override, with the
   deadline itself COMPUTED rather than stored.
3. **When the clock starts.** Answer: `created_at`.

## Scope as agreed

Backend only, no frontend. Three items:

1. Pagare expiry extraction.
2. Verdict deadline tracking.
3. Labels as org-scoped filters — investigated and found ALREADY COMPLETE on the backend.
