# Implementation — the two FIX bullets in `docs/bug_fixes/2/2.md`

Date: 2026-08-15

## FIX 1 — confirm before any delete or remove (2.md:16-17)

> "must be an are you sure you want to delete for any delete button first, to securely
> delete the object — this goes for ANY DELETE OR REMOVE OR SIMILAR COMMAND IN THE ENTIRE APP"

### New: `frontend/src/components/ConfirmDialog.tsx`
Built on the existing `Modal`, so it inherits Escape / ✕ / backdrop dismissal for free. All three
land on **Cancel** — dismissing a confirmation must never be read as consent, which would turn the
guard into the hazard it exists to prevent.

- `name` renders on its own line rather than glued into the question, so the user sees exactly WHICH
  record they are about to destroy.
- `description` carries knock-on effects (related records that go with it).
- Always ends with "This can't be undone." — none of these actions are recoverable.
- `confirmLabel`/`busyLabel` so a removal says "Remove", not "Delete".
- Both buttons lock while the action runs, so it can't be double-fired.

### Every destructive action found and guarded
Located by grepping for `method: "DELETE"` plus Delete/Remove labels. All four now route through the
dialog; none call the API directly from an onClick any more:

| Action | File |
|---|---|
| Delete credit case | `app/credit-cases/[id]/page.tsx` |
| Remove a required document | `app/credit-cases/[id]/page.tsx` |
| Delete customer | `app/customers/[id]/page.tsx` |
| Delete a customer contact | `app/customers/[id]/page.tsx` |

Each inline `onClick={async () => …}` became a named handler (`handleDeleteCustomer`,
`handleDeleteContact`, `handleDeleteCreditCase`) with the button only setting the pending target.
Row-level actions (contacts, requirements) hold the *target object* in state rather than a boolean,
so the dialog can name the specific row.

The contact Delete button also gained `aria-label={`Delete contact ${email}`}` — a table of
identical "Delete" links is ambiguous to a screen reader.

**Deliberately NOT guarded:** the filter chips' "Remove" in `CreditCaseTable`. It clears a filter —
nothing is destroyed, it is instantly reversible, and confirming it would be actively hostile. Say
the word if you want it included anyway.

## FIX 2 — status dot on the left (2.md:25)

> "should be on the left, not right, and very close/little margin bw circle and status text value"

`frontend/src/components/StatusDot.tsx` — `StatusWithDot` now renders the dot before the label and
tightens the gap from `gap-2` (8px) to `gap-1.5` (6px). Reads as a marker on the status rather than
a column of its own, and keeps the dots aligned down the table.

The credit case detail page's Status select already had its dot on the left, so it is unchanged.

## Tests

Frontend **175 passed** (was 166).

- `components/ConfirmDialog.test.tsx` (new, 8 tests) — closed renders nothing; the dialog names the
  target and warns it is permanent; confirm fires only on the explicit button; **parametrized over
  all three dismissal routes (Cancel, ✕, Escape) asserting each calls cancel and never confirm**;
  custom wording for removals; both buttons locked while busy.
- `components/StatusDot.test.tsx` — added a DOM-order assertion (`compareDocumentPosition`) that the
  dot precedes the text, so the position can't silently flip back.

`npx tsc --noEmit` and `npm run lint` clean. `/credit-cases`, `/customers`, `/credit-cases/[id]` and
`/customers/[id]` all return 200 with no dev-server errors.

## Not verified

No browser automation in this session, so the dialogs and the dot's new position are unverified by
eye. Behaviour is covered by tests; appearance is not.
