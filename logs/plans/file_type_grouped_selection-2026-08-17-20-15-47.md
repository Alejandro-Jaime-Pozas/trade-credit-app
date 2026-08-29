# Plan — grouped, searchable file type selection — 2026-08-18

## What changed underneath

The catalog went from 5 document types to 22 (`backend/core/file_type_catalog.py`), all
already synced into `storage.FileType`. Both places a user picks documents render them as
one flat row of buttons:

  - `FileTypeChooser` — the organization's default template (`/requirements`) and the
    documents one new credit case needs (`/credit-cases/new`);
  - the "Add a document this credit case needs" list on `/credit-cases/[id]`.

At 5 types a flat row was fine. At 22 it is a wall of unsorted labels.

## The blocker: there is no heading to group by

`FileTypeCategory` cannot supply one. It is a RECENCY bucket — it decides how far back a
document may be dated and still count — which is why a timeless acta constitutiva is
`category='other'`. Grouping by it would file articles of incorporation under "Other".

This is already written down: `decisions.md` ("A file type's `category` is a recency
bucket, not a subject grouping") ends by saying a SEPARATE display field is needed, and
`file_type_catalog_reference.md` carries "UI grouping ... deferred" as an open decision.
So this feature starts by building that field, rather than inventing a grouping in the
frontend — which the repo's own rule forbids anyway ("the frontend must NOT keep its own
list of them").

## Backend

1. `core/file_type_catalog.py` — `FileTypeGroup` constants, an ordered
   `FILE_TYPE_GROUPS` tuple of (key, heading) carrying the display order, and derived
   `FILE_TYPE_GROUP_LABELS` / `FILE_TYPE_GROUP_ORDER` maps. Add `group=` to all 23 specs,
   using the section headings `file_type_catalog_reference.md` already documents.
2. `storage/models.py` — `FileType.group` and `FileType.is_default_suggestion`.
3. Migration `0011` — the two AddFields **plus a RunPython re-running
   `sync_global_file_types`**. Without it a fresh database ends up with everything under
   "Other": migration `0009` seeds the rows before these columns exist.
4. `core/file_type_sync.py` — both new fields added to `SYNCABLE_FIELDS`.
5. `FileTypeSerializer` — `group`, `group_label`, `group_order`, `is_default_suggestion`.
6. Tests: catalog guards (every group is one the app can label; the two derived maps stay
   in step; **no requirable type falls back to "Other"**, which is the silent failure mode
   since `group` has a default), sync tests (copies both fields, repairs a hand-edit), and
   an API test pinning the four fields the frontend depends on.
7. `./scripts/sync-api-schema.sh`.

## Frontend

8. `src/lib/fileTypeGroups.ts` (pure) — `groupFileTypes` (buckets, orders by
   `group_order`, files an ungrouped type under a trailing "Other" rather than dropping
   it), `searchFileTypes` (English label, Spanish label, or key — the users are Mexican
   companies and will type "acta"), `suggestedFileTypeIds`.
9. `src/components/FileTypePicker.tsx` (new, presentational) — grouped sections, a search
   box that appears only past 8 types, optional per-group "Select all" / "Clear", optional
   pressed state. Selection state and what a click means stay with the caller, because the
   two callers differ: the chooser toggles a selection, the credit case page fires a
   request per click.
10. `FileTypeChooser` — swap the flat row for the picker, add a selected count, "Select
    suggested (n)" and "Clear all". Suggested ADDS to the current selection rather than
    replacing it. All 13 existing tests must still pass unchanged.
11. `/credit-cases/[id]` — the add-a-document list becomes the same picker, with the
    already-required types filtered out by the page.
12. Tests: `fileTypeGroups.test.ts`, `FileTypePicker.test.tsx` (including that "Select
    all" never reaches past the search filter), and new `FileTypeChooser` cases.

## Docs

13. `decisions.md` — new entry directly after the category one it follows from; update
    that entry's closing COST paragraph, which predicted this field.
14. `file_type_catalog_reference.md` — mark the "UI grouping" open decision RESOLVED.
15. `docs/versions/v1.md` — tick the "large selection at first..." item.
