# Prompt log — user-defined document requirements

Feature: `document_requirements`
Date: 2026-08-11

## Original request

> we need to implement this:
>
>  - [ ] user can modify strict requirements to consider solicitud as complete (not implemented; also
>    conflicts with Constraints: "no user-defined requirements")
>    - [ ] Simple initial user onboarding so they select a DEFAULT set of strict reqs
>    - [ ] When creating Credit Case, let user choose default set and/or any other reqs particular to
>      that customer
>
> so, for now requirements are equivalent to file uploads (by users) that belong to a specific credit
> case. an org user should be able to basically decide for themselves on a default template/list of
> files required to complete a credit case. the idea is that a user while onboarding first time, once
> a credit case is created and they click into it, if they DO NOT have a default requirements template
> yet, that they're prompted to create one. This template serves as the current replacement to the
> Required Documents section currently in http://localhost:3000/credit-cases/<id>
>
> So once a user creates their default template, those files the user chooses should appear under
> Required Documents for that specific credit case so that any matching file uploads start checking
> off those requirements.
>
> Ideally, the user will first choose from a default list that we have, which files they require. In
> the near future though, user should be able TO CREATE THEIR OWN FILE REQ NOT IN THAT APP DEFAULT
> LIST. So our initial list is CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED from backend/core/constants.py.
> But then the user can configure their own file type requirement to add to their template. So let's
> say they add a file namd 'carta de poderes' it will add that file type to their template and should
> in the backend trigger the creation of a pydantic model that extracts data specific to that file
> type, though for now we won't implement this functionality. Just consider this as part of the future
> plan for architectural decisions.
>
> questions:
>  - should we change the CREDIT_CASE_FILE_TYPE_NAMES_REQUIRED dict to something more formal to
>    future-proof this functionality?
>    - this should be dynamic enough to allow me being able to add/update/delete some of the default
>      file types available from the default list the user can choose from.
>  - what is the best way to synergize this: me add/update/delete file type names required (for users
>    to choose from) > user choose their own required files for their default required documents
>    template > (future implementation, not now) allow users to create their own required file type
>    names for their convenience

## Follow-up requirements

> for this, when the user changes the default required files, they should get a warning msg in
> frontend giving them the option of what to do with open cases. obviously closed cases are not
> affected, but open ones give the user the option to either update them or keep them with the prev
> default required files template.

> yes leave status alone.
> global file types will never be deactivated, perhaps only renamed. the default globals included from
> scratch that our app provides are just ideas for them to get started, those should be optional for
> the user to include/exclude in their templates.

> keep deferred, but let's save this as a future implementation so put it in v2.md of the app we'll
> need that change.

> Keep in mind I'll later give you a list of all file types involved that we'll need to add to that
> list, so it would be helpful to have one source of truth for those global file types and not have
> that source of truth spread out, they should all in some form read from the same base
> list/dict/set of file type names.

## Decisions confirmed during planning

| Question | Answer |
|---|---|
| Template owned by org or user | Org-level, with `created_by` |
| Existing cases/orgs | Backfill with today's 5 types |
| Definition of "open" | `submitted_at is null` |
| Audit trail on re-sync | Yes |
| v1 constraint conflict | Amend v1 (not defer to v2) |
| Org type shadowing a global | Defer with custom types |
| Scope | Backend only |
| Catalog depth | Data attributes only (leaves friendly-file-name logic alone) |
| User-created file types | Keep deferred, record in `docs/versions/v2.md` |
