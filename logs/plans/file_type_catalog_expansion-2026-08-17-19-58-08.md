# Plan: Expand the file type catalog to the v1 trade-credit document set

## Context

The catalog (`backend/core/file_type_catalog.py`) currently knows **5 requirable document
types** — four financial statements plus the Constancia de Situación Fiscal. Real Mexican
trade-credit underwriting needs considerably more, and the gaps are not cosmetic: there is
no `acta_constitutiva`, no `poder_notarial`, no identity document, and no
`referencias_comerciales` — the last being the most trade-credit-specific document there
is, since it is the only direct evidence of how an applicant pays its *other suppliers*,
which Buró does not capture.

We reviewed every candidate from three sources (the existing `docs/versions/v2.md`
backlog, a general trade-credit scope list, and a lender's real document checklist),
sorted them into what is actually an uploadable document versus extracted data / computed
metrics / external checks, and cut the ~49 candidates down to **22 for v1**. The full set
including everything deferred is recorded in
`docs/architecture/file_type_catalog_reference.md`, referenced from `docs/versions/v2.md`.

**Outcome:** 17 new file types available to requirement templates and per-case
requirements, each classifiable by GPT and (where there is anything to extract) backed by
its own extraction schema.

## Scope

**Backend only. Catalog only.** No model changes, no migration, no frontend work.

The catalog is data: `UploadDocument.file_type_name` deliberately has no `choices`,
`FileTypeViewSet` serves whatever is in the `storage.FileType` table, and the frontend
chooser reads `/file-types/`. So new types appear everywhere on their own.

Explicitly **not** in this change, all previously agreed:

- `quantity` on `CreditCaseRequirement` (per-person requirements — "ID de solicitante y
  aval(es)"). Own follow-up; it rewrites `missing_file_type_names`, which drives
  `requirements_complete` and the status transitions.
- Enforcing `months_required` — still advisory, see below.
- `equivalent_group` — **dropped from v1**. Its motivating case was `registro_fiscal`
  (R1 / Cédula Fiscal / CSF proving the same fact) and both alternatives are deferred,
  leaving a one-member group. `identificacion_oficial` is a single key covering
  INE/pasaporte/licencia, so it needs no group either.
- Buró consent (`carta_autorizacion_buro`, `reporte_buro_de_credito`,
  `solicitud_de_credito`) — deferred.
- UI grouping for the chooser. 22 types will make it crowded; `category` cannot carry the
  grouping because it means *recency bucket*, so this needs a separate display field.

## 1. Pydantic models — `backend/integrations/openai/services/pydantic_models/file_type_models.py`

**`PresenceOnlyPydantic`** (new, one shared model). For documents where the app only needs
to know a valid one exists — there is no data worth extracting from a pagaré or a photo of
a shop front. Subclasses `StrictBaseModel`, with `document_date` (optional), `is_legible`,
and a short `summary`. The date is what lets `create_friendly_file_name` still produce
something readable.

Deliberately NOT reusing `UnknownFileDataPydantic`: that is the classifier's "I have no
idea" bucket, and overloading it would destroy the one signal that says classification
failed.

**12 new extraction models**, following the existing conventions exactly — subclass
`DateBaseModel` (which supplies `date_range_start`/`date_range_end`), every field declared
with `Field(...)` and `Optional[...]` where it may be absent, because OpenAI structured
outputs require every property to be present and `extra: "forbid"`:

| Model | Key fields beyond the date range |
|---|---|
| `OpinionDeCumplimientoPydantic` | `rfc`, `sentido` (positiva/negativa) |
| `DeclaracionAnualPydantic` | `ejercicio`, `ingresos_acumulables`, `impuesto_causado` |
| `DeclaracionesProvisionalesPydantic` | `periodo`, `impuesto_a_cargo` |
| `CfdiFacturasPydantic` | `uuid_fiscal`, `emisor_rfc`, `receptor_rfc`, `total` |
| `CfdiNominaPydantic` | `emisor_rfc`, `total`, `num_empleados` |
| `DeclaracionAnualPersonalPydantic` | `rfc`, `ejercicio`, `ingresos_acumulables` |
| `ActaConstitutivaPydantic` | `razon_social`, `fecha_constitucion`, `objeto_social`, `capital_social`, `notario_numero` |
| `ActasDeAsambleaPydantic` | `fecha_asamblea`, `tipo_asamblea`, `acuerdos_principales` |
| `PoderNotarialPydantic` | `apoderado_nombre`, `tipo_de_poder`, `notario_numero` |
| `IdentificacionOficialPydantic` | `nombre_completo`, `tipo_identificacion`, `numero_identificacion`, `curp`, `vigencia` |
| `ComprobanteDeDomicilioPydantic` | `titular`, `direccion`, `tipo_servicio`, `fecha_emision` |
| `ReferenciasComercialesPydantic` | list of `ReferenciaComercial` (`empresa`, `contacto`, `linea_de_credito`, `plazo_dias`, `comportamiento_pago`) — mirrors how `CashflowStatementPydantic` nests `MonthlyNetCashflow` |

## 2. Catalog rows — `backend/core/file_type_catalog.py`

17 new `FileTypeSpec` entries. **P** = presence-only, **D** = `is_default_suggestion=True`.

| key | label_es | category | | |
|---|---|---|---|---|
| `opinion_de_cumplimiento` | Opinión de cumplimiento (32-D) | LEGAL | | **D** |
| `declaracion_anual` | Declaración anual | OTHER | | |
| `declaraciones_provisionales` | Declaraciones provisionales IVA/ISR | FINANCIAL | | |
| `cfdi_facturas` | CFDI de ingresos (facturas) | FINANCIAL | | |
| `cfdi_nomina` | CFDI de nómina | FINANCIAL | | |
| `declaracion_anual_personal` | Declaración anual persona física | OTHER | | |
| `constancia_no_adeudo_imss` | Constancia de no adeudo IMSS | LEGAL | **P** | |
| `alta_imss` | Alta patronal IMSS | OTHER | **P** | |
| `acta_constitutiva` | Acta constitutiva | OTHER | | **D** |
| `actas_de_asamblea` | Actas de asamblea / modificaciones | OTHER | | |
| `poder_notarial` | Poder notarial de apoderados | OTHER | | **D** |
| `identificacion_oficial` | Identificación oficial | OTHER | | **D** |
| `curp` | CURP | OTHER | **P** | |
| `comprobante_de_domicilio` | Comprobante de domicilio | LEGAL | | **D** |
| `referencias_comerciales` | Referencias comerciales | LEGAL | | **D** |
| `pagare` | Pagaré | OTHER | **P** | |
| `fotografias_establecimiento` | Fotografías del establecimiento | OTHER | **P** | |

**Category is a recency bucket, not a topic.** `MAX_MONTHS_BACK_BY_CATEGORY`
(`core/file_type_spec.py`) is FINANCIAL 2 months, LEGAL 3, OTHER unlimited — so annual and
timeless documents (acta constitutiva, poder notarial, declaración anual) go in OTHER
regardless of subject matter, and only genuinely must-be-recent documents get FINANCIAL or
LEGAL. Adding a fourth category is not an option here: it would silently get no recency
limit and be invisible to the FINANCIAL/LEGAL pair read at module level in
`processing/services/credit_case.py`.

Default suggestions end at **11** (the 5 existing plus the 6 marked **D**) — a workable
starter template rather than all 22.

`months_required` stays `None` on every new row **except** where it is semantically true,
with a comment on `FileTypeSpec.months_required` recording that the field is **not
currently enforced** for credit cases (`CreditCase.missing_file_type_names` is a plain set
difference with a TODO on it). Documenting the gap beats encoding a lie.

## 3. Classification prompt — `backend/integrations/openai/prompts/extract_file_data.py`

`EXTRACT_FILE_TYPE_NAME` is already generic (the allowed values come from the schema, built
per request from `FILE_TYPE_KEYS`), so classification picks the new types up with no change.

`EXTRACT_FILE_DATA` carries a few per-type hints. Add one for the shared presence-only
schema: summarize what the document is, judge legibility, and give its date if one is
visible.

## 4. Docs

**`docs/architecture/file_type_catalog_reference.md`** (already written, needs correcting):

- give each row its own **Category** column — the file currently labels categories at
  section level, which is now wrong (e.g. `acta_constitutiva` sits under "Legal" but is
  category OTHER)
- flip `comprobante_de_domicilio` to **v1** and `comprobante_domicilio_comercial` to
  **Deferred** (reversed from the first draft)
- rewrite the equivalence-group note: dropped from v1, not merely unused
- record the Buró consent deferral as confirmed

**`docs/versions/v2.md`** — swap `comprobante de domicilio` for
`comprobante de domicilio comercial` in the deferred Legal list, and add equivalence groups
to the carried-forward items.

**`docs/architecture/decisions.md`** — append under Backend, per
`ai/execution_context/feature_context.md`: why presence-only types share one model rather
than reusing `UnknownFileDataPydantic`; why category assignment follows recency rather than
subject; why equivalence groups were dropped; that `months_required` is advertised but
unenforced.

**Feature logs** — `logs/{prompts,plans,implementations}/file_type_catalog_expansion-<yyyy-mm-dd-hh-mm-ss>.md`.

## 5. Tests

**New `backend/core/tests/test_file_type_catalog.py`** — the catalog is now long enough
that a typo is a live risk, and these are cheap:

- every `key` is unique and lower_snake_case
- every spec has a `pydantic_model`; presence-only types all share `PresenceOnlyPydantic`
- every model's `model_json_schema()` satisfies what OpenAI structured outputs demand
  (`additionalProperties: false`, every property in `required`) — catches a model that
  would only fail at an actual API call
- `DEFAULT_SUGGESTION_KEYS ⊆ REQUIRABLE_KEYS`, and `unknown ∉ REQUIRABLE_KEYS`
- every `category` is a real `FileTypeCategory` value present in
  `MAX_MONTHS_BACK_BY_CATEGORY`

**Extend `backend/storage/tests/views_serializers/test_requirements.py`** — it already has
`test_sync_file_types_is_idempotent` and
`test_sync_file_types_repairs_a_renamed_label_without_touching_the_key`. Add an assertion
that the sync creates a row for every requirable catalog key, so a new spec can never be
added without reaching the table.

## Verification

1. `make pytest` — full suite green. Baseline is **178 passed, 6 skipped** at `84aa1ab`;
   confirm nothing regresses, since `DEFAULT_SUGGESTION_KEYS` grows from 5 to 11 and
   existing requirement tests may assert on template size.
2. `docker compose exec backend python manage.py makemigrations --check --dry-run` — must
   be **clean**. No model changed, and the catalog is an ordered tuple precisely so it
   cannot produce the phantom `AlterField` on `file_type_name` it used to.
3. `docker compose exec backend python manage.py sync_file_types` — reports 17 created;
   running it a second time reports 17 unchanged, 0 created.
4. `GET /api/v1/file-types/` returns 22 global rows.
5. Spot-check one new type end to end against a real document (`acta_constitutiva` or
   `identificacion_oficial`): upload it, watch the Celery worker log classify it, and
   confirm `file_type_name` and `extracted_data` land. This spends real OpenAI calls, so
   it is one document, and worth it — it is the only thing that proves a new extraction
   schema is actually accepted by the structured-outputs API.
