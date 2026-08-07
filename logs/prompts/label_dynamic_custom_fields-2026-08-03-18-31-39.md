# Prompt Log — label_dynamic_custom_fields — 2026-08-03

## Initial request

> i want to make the Label model flexible, in the future it should allow for any sort of labeling
> of diff db objs. is the best way to just m2m field to all objs now? or do that later? or what

Follow-up: "yes, plan it out" (approving a first plan based on a generic contenttypes tagging
design — `Label(name, value)` + `LabelAssignment` linking it to any number of objects).

## Course-correcting interruption (the actual requirement)

Before implementation began, the user interrupted with a materially different requirement:

> wait, before that, i need labels to offer the following. a label for a credit case for example,
> should let the user create and manage their own labels, and those lables in the frontend should
> for example, allow them to treat those labels as future fields in models...lets say a user
> creates a label 'sucursal' to label each credit case with its own sucursal. that sucursal label
> should then become a part of the credit case's fields somehow...i mean it could stay as a label
> linked to the credit case obj, but it should for all purposes be treated as a field in credit
> case model..so the label needs to be dynamic in this way, so users can have high customization
> that works..

Clarified via `AskUserQuestion`:
- Values: "I just need the user to be able to set the field, and then quickly reference existing
  labels and values (if MTY Norte already exists, then they should be able to quickly use it to
  label a new credit case)" → freeform values + a reuse/autocomplete lookup, no managed-options model.
- Scoping: a Label definition is scoped to exactly one model (e.g. "sucursal" only ever applies to
  CreditCase), not shared across CreditCase/Customer/UploadDocument.

Scope confirmed earlier and unchanged: full backend only (no React/UI); labelable models are
CreditCase, Customer, UploadDocument.

When migrating, the sole pre-existing `Label` row (id=1, "sucursal"/"mty nte", 0 links) blocked a
clean migration reverse-check since its `value` column had already been dropped by the forward
migration. Asked and got explicit approval to delete that one orphan row:

> "Delete the orphan row (Recommended)" — selected via AskUserQuestion.
