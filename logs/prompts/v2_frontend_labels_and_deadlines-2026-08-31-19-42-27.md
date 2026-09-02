# Prompt — v2 frontend: labels as dashboard columns, verdict deadlines, CSV export

Logged 2026-08-31 19:42:27.

## User prompt (verbatim)

> use multiple agents to complete only the frontend sections of the scope here..the backend is
> being built for it, so ensure you have the latest reqs for that.
>
> go. '/Users/Alex/Documents/Coding/Applications/trade_credit_app/docs/versions/v2.md'

## How it was read

"Only the frontend sections" of `docs/versions/v2.md` means:

- **§3 Labels as org-scoped filters** — the doc states outright that the backend for this is
  already complete and that "what is missing is entirely frontend: there is no UI anywhere for
  creating a label, setting its value on a case, or using one as a dashboard column."
- **§5 Frontend UI Views (this iteration)** — label columns on the dashboard, days passed /
  days remaining from §2, and CSV export as a stretch.

Deliberately NOT in scope, and why:

- **§1 Pagare expiry extraction** — backend only (a pydantic model and a prompt change).
- **§2 Verdict deadline tracking** — the doc says "backend only for now"; its FRONTEND surface
  (the days passed / days remaining columns) is named in §5 and is therefore in scope.
- **§4 Credit Case Summary Detail** — the doc marks it "its own milestone, deliberately NOT part
  of the first pass."
- The later `## Frontend UI Views` section's constancia-CSF customer-creation item and the
  `### Nice-to-haves` auto-save item — the first needs backend support for uploading a document
  before a customer exists, the second is explicitly marked "not priority".

## "Ensure you have the latest reqs"

The backend for §2 was being written in this same working tree while this ran. Rather than guess
at field names, `./scripts/sync-api-schema.sh` was run against the live stack to regenerate
`backend/schema.yaml` and `frontend/src/lib/api.generated.ts`. That confirmed the contract the
frontend codes against, and confirmed it was further along than `git diff` alone suggested.
