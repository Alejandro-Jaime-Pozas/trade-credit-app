# Prompt log — file type catalog expansion

Feature: `file_type_catalog_expansion`
Date: 2026-08-17

## What the user asked for, in sequence

1. "can you grab from somewhere the list of files that are typical in mexico for a company
   to grant trade credit? maybe they're somewhere in this repo, or in a doc? if not, then
   what are the typical files required to grant a trade credit?"

2. Supplied a ~60-item list ("Item Name" column, mixing documents with data fields and
   computed metrics) and asked: "any other important ones you might be missing from this
   list for trade credit purposes general scope?"

3. Supplied a second, messier list — a real lender's checklist in caps (ALTA EN HACIENDA
   (R1 Y CEDULA FISCAL), CARTA LIBERTAD DE GRAVAMEN, CARATULA DE ESTADOS DE CUENTA
   BANCARIOS, FOTOGRAFÍAS DEL ESTABLECIMIENTO, ...) — "just mention the files we're
   missing in our main list".

4. "sure, remind me what those 4's issues are so we can decide how to move fwd" — the four
   structural problems surfaced while reviewing the candidates.

5. Decisions on those four: "1. b / 2. ignore/dont implement for now / 3. b / 4. a", then
   "before implementing anything, we need to define the main catalog list so i can discard
   some we don't need in v1".

6. After the 49-row list was presented: "remove these: 5,6,7,8,9,10,11,12,13,14,16,17,28,
   32,34,35,36,37,39,40,41,43-47,49 — but store the full catalog somewhere in a .md file,
   add a col for those we didn't choose for this version, and reference that file in
   docs/versions/v2.md so we can later implement. do this above first, show me the final
   list."

7. Final revisions: "1. drop [equivalence groups] / 2. let's use comprobante_de_domicilio
   as the v1 default, leave comercial for later implementation / 3. defer [Buró consent].
   after noting those changes, implement that plan."

8. "ONLY implement backend changes, no frontend for now."

## Standing constraints applied

- `CLAUDE.md`: docstrings written for a beginner; tests required for anything that
  warrants them, run and verified; no access to `.env`; deletions need approval.
- `ai/execution_context/feature_context.md`: log prompt / plan / implementation, and record
  architectural reasoning in `docs/architecture/decisions.md`.
- `docs/architecture/CLAUDE.md`: decisions.md entry format (### title, `Decided <date>.`,
  bolded sub-claims, WHY reasoning, code refs).
