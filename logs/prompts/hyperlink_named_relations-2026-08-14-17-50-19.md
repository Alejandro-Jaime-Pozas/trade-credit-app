# Prompt

> can you implement the following for the backend hyperlink serializers? it doesn't really
> help to get the serializer url with an id, what's helpful is a name or similar identifier
> but which is also a hyperlink that takes you to that specific item. can you implement this?

## Clarifications gathered (via AskUserQuestion)

1. **Field shape**: replace the field itself with an object combining the link and a
   human-readable name, e.g. `{"url": "...", "display": "Acme Corp"}` — not an additive
   `*_display` sibling field.
2. **Scope**: only relation/FK fields that point to ANOTHER object (e.g. a CreditCase's
   `customer`, `assigned_to`). A resource's own self `url` identity field is unaffected.
