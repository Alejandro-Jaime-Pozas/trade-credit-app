# Implementation log — file type catalog expansion

Feature: `file_type_catalog_expansion`
Date: 2026-08-17
Base: commit `84aa1ab`

## Result

Requirable file types went from **5 to 22**. `209 passed, 6 skipped` (was 199 passed,
6 skipped — 10 new tests). No migration, no model changes, no frontend changes.

## Scope decisions taken into this change

Four structural problems surfaced while reviewing candidate documents. The user's calls:

1. **Presence-only types** → shared `PresenceOnlyPydantic` (option b), not
   `pydantic_model: type | None`.
2. **`months_required` enforcement** → ignore for now; values still recorded honestly.
3. **Per-person requirements** (ID per aval / beneficial owner) → a `quantity` field on
   `CreditCaseRequirement` (option b) — **deferred to its own change**, since it rewrites
   `missing_file_type_names`, which drives status transitions.
4. **Equivalence groups** → originally accepted (option a), then **dropped** once the v1
   cut left every group with a single member.

Plus: `comprobante_de_domicilio` ships in v1 and `comprobante_domicilio_comercial` is
deferred (reversed from the first draft), and Buró consent stays deferred.

## 1. Pydantic models — `integrations/openai/services/pydantic_models/file_type_models.py`

- `PresenceOnlyPydantic` (new, shared by 5 types): `document_date`, `is_legible`,
  `summary`. Deliberately not `UnknownFileDataPydantic`, which means "classification
  failed" — see decisions.md.
- 12 new extraction models: `OpinionDeCumplimientoPydantic`, `DeclaracionAnualPydantic`,
  `DeclaracionesProvisionalesPydantic`, `CfdiFacturasPydantic`, `CfdiNominaPydantic`,
  `DeclaracionAnualPersonalPydantic`, `ActaConstitutivaPydantic`,
  `ActasDeAsambleaPydantic`, `PoderNotarialPydantic`, `IdentificacionOficialPydantic`,
  `ComprobanteDeDomicilioPydantic`, `ReferenciasComercialesPydantic` (which nests a
  `ReferenciaComercial` list, mirroring how `CashflowStatementPydantic` nests
  `MonthlyNetCashflow`).
- Every optional value is `Optional[X] = Field(...)`, never `= None`. OpenAI structured
  outputs reject a schema unless every property appears in `required`; the pydantic-idiomatic
  default would drop it and the API refuses the whole request — inside a Celery worker, at
  classification time.
- Folded the one-model `# LEGAL` heading into `## TAX / SAT`, since the Constancia de
  Situación Fiscal is a SAT document.

## 2. Catalog — `core/file_type_catalog.py`

17 new `FileTypeSpec` rows. Section comments now carry an explicit warning that they are
NOT the `category` field.

Categories assigned by **recency**, not subject: `acta_constitutiva`, `poder_notarial`,
`identificacion_oficial`, `declaracion_anual` and the rest of the timeless/annual documents
are `OTHER` (no recency limit), because the `LEGAL` bucket's 3-month limit would reject
every valid copy.

Default suggestions: 5 → 11, adding `opinion_de_cumplimiento`, `acta_constitutiva`,
`poder_notarial`, `identificacion_oficial`, `comprobante_de_domicilio`,
`referencias_comerciales`.

Docstrings extended on `FileTypeSpec.pydantic_model` (presence-only rule) and
`FileTypeSpec.months_required` (**NOT CURRENTLY ENFORCED**, with the reason).

## 3. Prompt — `integrations/openai/prompts/extract_file_data.py`

`EXTRACT_FILE_TYPE_NAME` needed no change: allowed values are built per request from
`FILE_TYPE_KEYS`, so new types are offered automatically. Added two hints to
`EXTRACT_FILE_DATA` — single-issue-date documents should set `date_range_start` ==
`date_range_end`, and how to fill the presence-only schema.

## 4. Tests

- **New `core/tests/test_file_type_catalog.py`** (9 tests, no DB): unique keys,
  lower_snake_case keys, both labels present, every category has a recency rule, `unknown`
  is the only non-requirable type, defaults ⊆ requirable, only `unknown` uses
  `UnknownFileDataPydantic`, presence-only types really do share one model, and every
  extraction model (recursing into `$defs`) satisfies OpenAI's structured-output rules.
- **`storage/tests/views_serializers/test_requirements.py`**: added
  `test_every_requirable_catalog_type_reaches_the_table` — catches a spec added to the
  catalog but never synced to the `FileType` table, which is invisible to users and errors
  nowhere.

## Caught during implementation

**Two failure modes, both from the catalog growing rather than from bad code.**

1. `make pytest` reported 4 failures in the sync tests (`(17, 0) == (0, 0)`). Cause: pytest
   runs with `--reuse-db`, and the test database was built when the catalog had 5 types, so
   migration 0009 had already run and does not re-run. `pytest --create-db` was the fix —
   worth knowing, because the same thing will happen to anyone else adding catalog types.

2. On the fresh database, 4 different tests failed in
   `storage/tests/models/test_requirements.py`. Its `make_file_type()` helper defaulted to
   `key='acta_constitutiva'` — chosen originally *because* it was not a real catalog key.
   Now that it is, migration 0009 seeds it as a global row and the test's second global row
   trips the partial unique index on `key WHERE organization IS NULL`. Fixed by moving the
   helper to a synthetic `test_only_document` key, with a docstring explaining why it must
   stay out of the catalog. Recorded in the reference doc as a standing trap.

## 5. Docs

- **`docs/architecture/file_type_catalog_reference.md`** (new) — all ~49 candidate types
  with a Status column (v1 / Deferred), per-row Category, presence-only markers, the "not
  file types" table (extracted data vs computed metrics vs external checks), what is
  already modelled on `Customer`/`CreditCase`, and the five open decisions.
- **`docs/versions/v2.md`** — points at that file; deferred list and carried-forward items
  expanded.
- **`docs/architecture/decisions.md`** — four new Backend entries: presence-only sharing one
  model, category-as-recency, why equivalence groups were dropped, and why
  `months_required` is recorded but unenforced.

## Verification

```
pytest --create-db      209 passed, 6 skipped
makemigrations --check  No changes detected
sync_file_types (1st)   17 created, 0 updated, 5 unchanged
sync_file_types (2nd)   0 created, 0 updated, 22 unchanged
```

`makemigrations --check` being clean matters specifically here: `file_type_name` has no
`choices` and the catalog is an ordered tuple, which is what stops the phantom `AlterField`
this used to produce on nearly every run.

**Not yet exercised against a real document.** The 12 new extraction schemas are validated
against OpenAI's structural rules by test, but no new type has been classified by a live
API call — that spends money, so it is left for the user to confirm with a genuine upload
(`acta_constitutiva` or `identificacion_oficial` are the best first checks).
