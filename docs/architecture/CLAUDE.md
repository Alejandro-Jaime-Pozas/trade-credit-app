# Instructions for `docs/architecture/decisions.md`

This file governs how content gets added to `decisions.md` in this directory.
`decisions.md` is a log of *why* the app is built the way it is — not a design
doc, not a changelog. Anyone reading it later (including a beginner engineer
with no context on this codebase) should come away understanding the reasoning
without needing to ask.

## When to add an entry

Per the root `CLAUDE.md` / `ai/execution_context/feature_context.md`: log the
most important architectural decisions — ones that meaningfully reshape
functionality from previous versions or are fundamental to the app's
architecture. Not every code change qualifies; a decision entry is for
choices that would confuse a future reader if left unexplained ("why does
this work this way instead of the obvious way?").

## Where it goes

Add the entry under its matching `##` section (`DB`, `Backend`, `Frontend`,
etc.). If the right section doesn't exist yet, create it as a new `##`
heading rather than shoehorning the entry into an unrelated one.

## Entry format

Each decision is a `###` heading, formatted as:

```
### <Decision title>

Decided <yyyy-mm-dd>. <One sentence: what this replaces or changes, if anything.>

<Reasoning, in whatever mix of paragraphs, bullet points, and short code refs
(`path/to/file.py`) best explains it.>
```

- **Title**: short and specific enough to skim — describes the decision, not
  the feature. ("Requirements are copied onto a credit case, not referenced
  from a template" beats "Requirement templates.")
- **Timestamp**: `Decided yyyy-mm-dd` on the line directly under the title,
  using the actual date the decision was made/written.
- **Multiple decisions in one sitting** (e.g. one feature produced several
  independent architectural calls): give each its own `###` entry rather than
  bundling them under one title. Group them under the same `##` section if
  they share one.
- **Reasoning is the point of the entry.** Don't just state the decision —
  explain the WHY: what problem it avoids, what alternative was considered
  and rejected (and why), and any cost/tradeoff being accepted knowingly.
  Use bullet points for multiple distinct reasons, a short paragraph for a
  single connected explanation, and inline code refs (`` `Model.field` ``,
  `` `path/to/file.py` ``) to ground claims in real code rather than
  describing it abstractly.

## Writing level

Write for a beginner software engineer with limited experience in this
codebase:

- Don't assume familiarity with prior decisions — restate the relevant
  context in a clause rather than pointing back at "the above."
- Spell out acronyms and framework-specific behavior the first time they
  matter in an entry (e.g. what a Django `Q` object does, why DRF builds FK
  querysets a certain way) if the decision hinges on that behavior.
- Prefer concrete language ("a set's iteration order changes per process")
  over jargon-only shorthand.

## Reference

See the existing `Document requirements` entry in `decisions.md` (Backend
section) as the template to match — title, `Decided <date>.`, bolded
sub-claims, `WHY:`-style reasoning, and code refs throughout.
