# Prompt Log — organization_scoped_writes — 2026-08-08

## Origin

Follows on from adding a `# Security` section to `CLAUDE.md` (multi-tenant isolation is mandatory) and
a subsequent model-by-model audit of organization scoping across the backend, which surfaced several
live cross-tenant write gaps: `CreditCaseSerializer.customer`, `CustomerContactSerializer.customer`,
and `UploadDocumentSerializer.customer`/`.credit_case` are all writable ForeignKey fields with
unfiltered querysets and no ownership validation.

## Request

> okay for the live write-side gaps, create a plan to fix those and show me what the changes will be.

## Clarifications during planning (via AskUserQuestion)

1. Scope, beyond the 3 core FK gaps:
   - Include `CreditCase.assigned_to` (also writable/unscoped — same bug class).
   - Include setting `UploadDocument.uploaded_by` (field exists, never populated).
2. `CustomerContact.organization` vs `customer.organization` (can currently disagree): derive
   `organization` from `customer.organization`, **provided** the existing uniqueness comment/intent
   ("required to enforce uniqueness of contact email within an organization...") is preserved. Verified
   this actually strengthens the constraint, since `organization` is nullable and Postgres skips NULLs
   in unique constraints — deriving from the non-null `Customer.organization` makes it reliably
   enforced.
3. Add regression tests for all three gaps, mirroring the existing `test_label.py` cross-tenant test
   pattern, including standing up `customers/tests/` from scratch.

## Course-correction during planning

- First draft put the write-scoping fix in a brand-new `OrganizationScopedSerializerMixin` living in
  `core/serializer_utils.py`. User pushed back twice:
  1. "wait shouldn't this module be in another dir/package? app/mixins.py" — questioning where the
     *existing* `OrganizationScopedMixin` lived, not just the new one.
  2. After moving the new mixin next to it in `app/mixins.py`: "i meant strategically and logically,
     isn't it better to put app/mixins.py somewhere else? like the core app or something? where do
     coders usually put mixin files?" — the actual ask was relocating `app/mixins.py` itself, since
     `app/` is Django project config (settings/urls/wsgi/asgi), not a shared-code location, and this
     repo already has a conventional shared app (`core/`) holding exactly this kind of thing.
     → Confirmed via AskUserQuestion: fold the `app/mixins.py` → `core/mixins.py` move into this fix
     rather than doing it separately.
  3. "do we really need to org scope mixins? the original just includes get_queryset / read, but my
     intention was to scope any user action to the org. if we can keep it in one mixin would be best"
     — rejected the two-mixin (view + serializer) split entirely. Redesigned as a single
     `OrganizationScopedMixin` with a second declarative attribute (`organization_scoped_fields`)
     alongside the existing `organization_lookup`, enforced via a `get_serializer()` override on the
     same mixin — one mixin, one place per viewset declares both the read-scope and the write-scope.

Final plan approved as written to
`logs/plans/organization_scoped_writes-2026-08-08-12-17-08.md` (mirrored from
`/Users/Alex/.claude/plans/okay-for-the-live-deep-pony.md`).
