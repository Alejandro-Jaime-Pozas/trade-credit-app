# Implementation Log — delete_credit_case — 2026-06-18

## Files changed

### `frontend/src/app/credit-cases/[id]/page.tsx`
- Imported `useRouter` from `next/navigation`
- Instantiated `router` via `useRouter()`
- Added `deleting` state (`useState(false)`)
- Replaced standalone Back `<Link>` with a `<div className="flex items-center gap-2">` wrapping both Back and a new Delete button
- Delete button: calls `DELETE` on `creditCase.url` via `apiJson<void>`, then redirects to `/credit-cases` on success; sets error on failure and resets `deleting` to allow retry
- Button style matches the delete customer button: `border-red-200 text-red-700 hover:bg-red-50`
