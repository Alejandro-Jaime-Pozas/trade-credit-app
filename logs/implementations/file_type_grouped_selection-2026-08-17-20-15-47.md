# Implementation — grouped, searchable file type selection — 2026-08-18

Backend `216 passed, 6 skipped`; frontend `307 passed` across 25 files; `npx tsc --noEmit`
and `npm run lint` clean.

---

## Backend

**`backend/core/file_type_catalog.py`**
- New `FileTypeGroup` (financial / tax / legal / credit / collateral / operational / other)
  with a docstring spelling out why it is not `FileTypeCategory`: category is a RECENCY
  bucket, which is why a timeless acta constitutiva is `category='other'` and would have
  been filed under "Other" in any category-based grouping.
- `FILE_TYPE_GROUPS`, an ordered tuple of (key, heading) — this tuple IS the display order.
  `FILE_TYPE_GROUP_LABELS` and `FILE_TYPE_GROUP_ORDER` derive from it.
- New `FileTypeSpec.group` field (defaults to OTHER) and `group=` set on all 23 specs,
  matching the section headings already in `file_type_catalog_reference.md`:
  Financial 4, Tax / SAT 9, Legal / corporate 6, Credit process 2, Operational 1,
  Other 1 (`unknown`, which is not requirable). Collateral / aval is declared with no
  members, ready for the deferred types the reference doc lists.

**`backend/storage/models.py`** — `FileType.group` and `FileType.is_default_suggestion`.

**`backend/storage/migrations/0011_...`** — the two AddFields plus a `RunPython` that
re-runs `sync_global_file_types`. This is the part that actually matters: migration `0009`
seeds the FileType rows on a fresh database and runs BEFORE these columns exist, so without
it a brand new install would show all 22 documents under a single "Other" heading.

**`backend/core/file_type_sync.py`** — `group` and `is_default_suggestion` added to
`SYNCABLE_FIELDS`, so both are repaired by a re-sync like every other catalog field.

**`backend/storage/serializers.py`** — `FileTypeSerializer` now sends `group`,
`group_label`, `group_order` and `is_default_suggestion`. Label and order are computed from
the catalog maps rather than stored per row, since they are properties of the group.

**Tests**
- `core/tests/test_file_type_catalog.py` (+4): every group is one the app can label; the
  two derived maps stay in step with `FILE_TYPE_GROUPS`; **no requirable type falls back to
  "Other"** — the silent failure mode, since `group` has a default and forgetting it just
  drops a document into a vague heading; every requirable type lands in a known group.
- `storage/tests/views_serializers/test_requirements.py` (+3): the sync copies both new
  fields, repairs them after a hand-edit, and the `/file-types/` endpoint carries all four
  fields with financials ordered before legal.

`schema.yaml` / `api.generated.ts` regenerated.

---

## Frontend

**`src/lib/fileTypeGroups.ts`** (new, pure)
- `groupFileTypes` — buckets by `group`, orders by `group_order`, and files a type the
  backend did not group under a trailing "Other" instead of dropping it (a document the
  user cannot see is worse than one under a vague heading).
- `searchFileTypes` — matches English label, Spanish label or key. The users are Mexican
  companies who will type "acta" as readily as "articles of incorporation".
- `suggestedFileTypeIds` — the catalog's recommended starting set.

**`src/components/FileTypePicker.tsx`** (new) — the shared grouped list: headings, a search
box that only appears past 8 types, optional per-group "Select all Financial" / "Clear
Financial", optional pressed state. Deliberately presentational — selection state and the
meaning of a click stay with the caller, because the two callers genuinely differ. It also
only sets `aria-pressed` when `selectedIds` is passed: the credit case page's "+ Add"
buttons are actions, and announcing them as toggles would be wrong.

**`src/components/FileTypeChooser.tsx`** — the flat row is now the picker, plus a header
row with the selected count, "Select suggested (n)" and "Clear all". Suggested ADDS to the
current selection rather than replacing it, so a user who picked two documents first keeps
them. The Default-vs-documents exclusivity, the dimming, and all 13 existing tests are
untouched.

**`src/app/credit-cases/[id]/page.tsx`** — "Add a document this credit case needs" uses the
same picker, with a new `addableFileTypes` memo filtering out what the case already asks
for. Filtering stays in the page so the picker has no opinion about what is offerable.

**Tests**
- `src/lib/fileTypeGroups.test.ts` (13) — declared order beats alphabetical, nothing is
  lost, ungrouped types get a home, search by all three names, suggested ids.
- `src/components/FileTypePicker.test.tsx` (13) — headings in backend order, search
  narrows (and headings follow), Spanish search, empty-search message, no search box for a
  short list, pressed state only where selection is a state, group select/clear, and
  **"Select all" never reaching past the current search filter**.
- `src/components/FileTypeChooser.test.tsx` (+4) — suggested in one click, adding rather
  than replacing, no shortcut when nothing is suggested, count and clear-all.

---

## Docs

- `docs/architecture/decisions.md` — new entry "`FileTypeSpec.group` is that separate
  display field", placed directly after the `category` entry it follows from; that entry's
  closing COST paragraph (which predicted this field) now points at it.
- `docs/architecture/file_type_catalog_reference.md` — "UI grouping" open decision marked
  RESOLVED; the default-suggestions section notes the shortcut it now drives.
- `docs/versions/v1.md` — the "large selection at first of relevant customer files" item
  ticked, with a note on what shipped.

---

## Follow-up fix (2026-08-18)

This change broke `manage.py migrate` on a FRESH database: adding `group` /
`is_default_suggestion` to `SYNCABLE_FIELDS` made migration `0009` write columns that do
not exist until `0011`. Existing databases were unaffected, and the suite passed because
`pytest.ini` sets `--reuse-db`, so `0009` was never replayed.

Fixed by `syncable_fields_for()` in `core/file_type_sync.py`, which narrows the write to
the fields the model version being handed over actually has. Full write-up in
`logs/errors/file_type_grouped_selection-2026-08-18-17-57-29.md`. Backend suite is now
**220 passed, 6 skipped** under `pytest --create-db`.
