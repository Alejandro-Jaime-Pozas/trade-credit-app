# File type catalog — full reference

The complete set of document types identified as relevant to Mexican trade credit
underwriting, whether or not they are implemented yet.

**This file is a reference list, not a source of truth.** The source of truth for what the
app actually knows about is `backend/core/file_type_catalog.py`. This document exists so
the types deferred out of v1 are not lost, and so the reasoning behind each row survives.

Sources: the previous catalog, the `docs/versions/v2.md` candidate list, and two
requirement lists supplied by the product owner (2026-08-17) — a general trade-credit
scope list and a lender's actual document checklist.

## How to read this

- **v1** — in `FILE_TYPE_CATALOG` today. 22 requirable types, plus `unknown`.
- **Deferred** — not implemented. To add one: move it into the catalog as a `FileTypeSpec`
  (plus a pydantic extraction model, unless it is presence-only), then
  `manage.py sync_file_types`. Nothing else about it needs re-deciding.
- **P** (presence-only) — nothing worth extracting; the app only needs to know a legible
  document of that kind arrived. Shares `PresenceOnlyPydantic` (`document_date`,
  `is_legible`, `summary`) rather than carrying its own schema.
- **Cat** — the `category` field, which is a **recency bucket**, not a topic.
  `MAX_MONTHS_BACK_BY_CATEGORY` (`core/file_type_spec.py`) is FINANCIAL 2 months, LEGAL 3,
  OTHER unlimited. So annual and timeless documents sit in OTHER *regardless of subject* —
  an acta constitutiva is a legal document but is category OTHER, because a 3-month
  recency limit would reject every valid one. The section headings below are for human
  reading only.

A fourth category is not available: `max_months_back()` reads the dict with `.get()`, so
an unknown category silently means "no recency limit", and
`processing/services/credit_case.py` reads the FINANCIAL and LEGAL buckets by name at
module level.

---

## Financial

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `balance_sheet` | Balance general | FINANCIAL | **v1** | |
| `income_statement` | Estado de resultados | FINANCIAL | **v1** | |
| `cashflow_statement` | Estado de flujo de efectivo | FINANCIAL | **v1** | |
| `bank_statement` | Estado de cuenta bancario | FINANCIAL | **v1** | |
| `estados_financieros_dictaminados` | Estados financieros auditados | FINANCIAL | Deferred | required above a size threshold |
| `estados_financieros_internos` | Estados financieros internos | FINANCIAL | Deferred | current-year partials, between annual closes |
| `caratula_estado_de_cuenta` | Carátula de estado de cuenta | FINANCIAL | Deferred (P) | cover page only — account holder, number, CLABE. Verifies *whose* account it is; distinct from `bank_statement`, which is 12 months of transactions for cashflow analysis |
| `antiguedad_saldos_cxc` | Antigüedad de saldos por cobrar | FINANCIAL | Deferred | AR aging |
| `antiguedad_saldos_cxp` | Antigüedad de saldos por pagar | FINANCIAL | Deferred | AP aging |
| `relacion_de_deuda` | Relación de créditos vigentes | FINANCIAL | Deferred | debt schedule — existing obligations |
| `proyecciones_financieras` | Proyecciones financieras | OTHER | Deferred | forward-looking, not historical evidence |
| `relacion_activos_fijos` | Relación de activos fijos | FINANCIAL | Deferred | |
| `estado_financiero_personal` | Estado financiero personal | FINANCIAL | Deferred | for an aval or persona física con actividad empresarial |
| `cedula_profesional_contador` | Cédula profesional del contador | OTHER | Deferred (P) | verifies who signed the financials |

## Tax / SAT

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `constancia_de_situacion_fiscal` | Constancia de situación fiscal | LEGAL | **v1** | auto-fills the customer's RFC, razón social and address (`promote_csf_fields_to_customer`) |
| `opinion_de_cumplimiento` | Opinión de cumplimiento (32-D) | LEGAL | **v1** | must be *positiva* |
| `declaracion_anual` | Declaración anual | OTHER | **v1** | OTHER because an annual return is always older than any recency limit |
| `declaraciones_provisionales` | Declaraciones provisionales IVA/ISR | FINANCIAL | **v1** | monthly filings |
| `cfdi_facturas` | CFDI de ingresos (facturas) | FINANCIAL | **v1** | |
| `cfdi_nomina` | CFDI de nómina | FINANCIAL | **v1** | corroborates headcount |
| `declaracion_anual_personal` | Declaración anual persona física | OTHER | **v1** | |
| `constancia_no_adeudo_imss` | Constancia de no adeudo IMSS | LEGAL | **v1** (P) | labor liability exposure |
| `alta_imss` | Alta patronal IMSS | OTHER | **v1** (P) | validates claimed employee count against something official |
| `alta_hacienda_r1` | Alta en Hacienda (R1) | OTHER | Deferred | older companies hold an R1; newer ones only ever get a CSF |
| `cedula_identificacion_fiscal` | Cédula de identificación fiscal | OTHER | Deferred | same underlying fact as the CSF, different artifact |

## Legal / corporate

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `acta_constitutiva` | Acta constitutiva | OTHER | **v1** | timeless, so no recency limit |
| `actas_de_asamblea` | Actas de asamblea / modificaciones | OTHER | **v1** | amendments since incorporation. The original acta can be decades stale — this is where restructurings show up |
| `poder_notarial` | Poder notarial de apoderados | OTHER | **v1** | |
| `identificacion_oficial` | Identificación oficial | OTHER | **v1** | one key covering INE, pasaporte and licencia; `tipo_identificacion` records which was supplied |
| `curp` | CURP | OTHER | **v1** (P) | |
| `comprobante_de_domicilio` | Comprobante de domicilio | LEGAL | **v1** | CFE, agua, predial — the 3-month LEGAL bucket is exactly the usual rule |
| `comprobante_domicilio_comercial` | Comprobante de domicilio comercial | LEGAL | Deferred | the operating address, often different from the fiscal one — for trade credit this is where the goods actually go |
| `folio_mercantil` | Folio mercantil (RPPC) | OTHER | Deferred (P) | proof the acta is actually registered |
| `declaracion_beneficiario_controlador` | Declaración de beneficiario controlador | OTHER | Deferred (P) | a distinct SAT filing since the 2022 CFF Art. 32-B Ter reform, not merely UBO data |

## Credit process

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `referencias_comerciales` | Referencias comerciales | LEGAL | **v1** | trade references from the applicant's *other* suppliers. The most trade-credit-specific document in this list — direct evidence of payment behaviour with peers, which Buró does not capture |
| `pagare` | Pagaré | OTHER | **v1** (P) | the enforceable instrument — what lets you actually collect |
| `solicitud_de_credito` | Solicitud de crédito firmada | OTHER | Deferred (P) | the signed application itself |
| `carta_autorizacion_buro` | Autorización de consulta a Buró | OTHER | Deferred (P) | written consent required under the Ley para Regular las Sociedades de Información Crediticia. See the open gap below |
| `reporte_buro_de_credito` | Reporte de Buró de Crédito | LEGAL | Deferred | |
| `referencias_bancarias` | Referencias bancarias | LEGAL | Deferred | |
| `aviso_privacidad_firmado` | Aviso de privacidad firmado | OTHER | Deferred (P) | |
| `contrato_de_credito` | Contrato de crédito | OTHER | Deferred (P) | |

## Collateral / aval

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `escritura_inmueble` | Escritura del inmueble | OTHER | Deferred | property deed |
| `certificado_libertad_gravamen` | Certificado de libertad de gravamen | LEGAL | Deferred | issued by the RPP; proves no liens on the property |
| `avaluo` | Avalúo | LEGAL | Deferred | appraisal |
| `poliza_de_seguro` | Póliza de seguro | OTHER | Deferred (P) | insurance on the collateral |
| `inscripcion_rug` | Inscripción en el RUG | OTHER | Deferred (P) | movable-collateral lien registry |

## Operational

| key | Label ES | Cat | Status | Notes |
|---|---|---|---|---|
| `fotografias_establecimiento` | Fotografías del establecimiento | OTHER | **v1** (P) | standard *visita ocular* practice in Mexican SME lending. `ALLOWED_FILE_EXTENSIONS` already permits jpg/jpeg/png. The one type where GPT vision could do real verification rather than field extraction |
| `orden_de_compra` | Orden de compra / contrato de suministro | OTHER | Deferred (P) | establishes the commercial relationship the credit sits on |

---

## Default suggestions

`is_default_suggestion` is served to the frontend, which offers it as a "Select suggested"
shortcut in the requirement chooser — so setting up for the first time is a review of a
sensible list rather than 22 separate decisions.

11 of the 22 v1 types are `is_default_suggestion=True`, so a new organization's first
requirement template is a workable starter rather than all 22:

`balance_sheet`, `income_statement`, `cashflow_statement`, `bank_statement`,
`constancia_de_situacion_fiscal`, `opinion_de_cumplimiento`, `acta_constitutiva`,
`poder_notarial`, `identificacion_oficial`, `comprobante_de_domicilio`,
`referencias_comerciales`.

## Not file types

Several items on the source lists are *not* uploadable documents and must not become
catalog rows. A `FileType` row becomes something a `CreditCaseRequirement` can demand, and
`requirements_complete` only flips when a matching `UploadDocument` exists — so a catalog
row that no upload can satisfy leaves a case stuck in `missing_documents` forever.

| Kind | Examples | Belongs in |
|---|---|---|
| Data extracted from a document | Business Legal Name, Legal Rep RFC, UBO ownership %, Annual Revenue | pydantic extraction models + model fields |
| Application input the user types | Loan Purpose, Desired Tenure, Source of Funds, Business Model | `CreditCase` fields / a questionnaire |
| Computed metric | DSCR, PD, Revenue Trend, Cash Flow Volatility, Buró Score | underwriting engine (prior art commented out in `backend/misc.py`) |
| External check | PEP screening, sanctions screening, SAT 69-B, lien check, tamper detection | integrations |

Already modelled, so do not rebuild: Business Legal Name → `Customer.legal_name`;
Commercial Name → `Customer.name`; Entity Type → `Customer.type`; Business Address →
`Customer`'s CSF address breakdown; Contact Info → `CustomerContact`; Loan Amount →
`CreditCase.requested_amount`; Desired Tenure → `CreditCase.requested_term_days`.

Not modelled anywhere yet: beneficial owners (names, CURP/RFC, ownership %), legal
representative fields, loan purpose, source of funds, years in operation, employee count.

## Open decisions carried into v2

**Per-person requirements.** `unique_file_type_per_credit_case` allows one requirement row
per type per case, and completion compares *sets* of keys — so a single uploaded ID
satisfies `identificacion_oficial` no matter how many people need one. Real requirements
read "de solicitante y aval(es)" and "of all beneficial owners". Agreed fix, not yet built:
a `quantity` field on `CreditCaseRequirement` (and `RequirementTemplateItem`) with
`missing_file_type_names` comparing counts instead of set membership. The full fix is
modelling the people (`Aval`, `BeneficialOwner`) and attaching requirements per person.

**`months_required` is advisory, not enforced.** `CreditCase.missing_file_type_names`
(`processing/models.py`) is a plain set difference with a TODO on it, so `bank_statement`'s
`months_required=12` is satisfied by one statement. Month-coverage machinery exists
(`check_aggregate_satisfied_month_intervals`) but lives on `AccountApplication` and is
gated on `type == 'loan'`. Deliberately left alone; the catalog still records honest
values so they are right when enforcement lands. Also unresolved: the field counts months,
but "2 fiscal years of audited financials" is 2 annual documents, not 24.

**Equivalence groups — dropped from v1, not merely unused.** The idea was an
`equivalent_group` on `FileTypeSpec` so several documents proving the same fact could each
satisfy one requirement. Its motivating case was `registro_fiscal` (R1 / Cédula Fiscal /
CSF), and both alternatives are deferred, which would have left a one-member group.
`identificacion_oficial` needs no group either: it is a single key covering three physical
forms. Revisit when `alta_hacienda_r1` or `cedula_identificacion_fiscal` land.

**Buró consent gap.** `processing/choices_for_models.py` has a `BURO_DE_CREDITO_REJECTED`
status and there is a `buro_de_credito` integration, but `carta_autorizacion_buro` is
deferred — so nothing records the legally required consent before a report is pulled.
Confirmed as deliberate for v1; close it before the Buró integration goes live.

**UI grouping — RESOLVED 2026-08-18.** With 22 types the chooser needed the section
headings above, and `category` could not carry them (it means recency). `FileTypeSpec.group`
now does, mirrored onto `storage.FileType.group` and served as `group` / `group_label` /
`group_order` so the frontend groups and orders without keeping its own copy of the list.
The headings in this document ARE those groups, in English — the app SHOWS them in
Spanish (Financieros, Fiscales / SAT, Legales / corporativos, Proceso de crédito,
Garantías / aval, Operativos, Otros), because they sit directly above the Spanish document
names. `FILE_TYPE_GROUPS` in the catalog is the mapping. `Collateral / aval` is declared
with no members yet, ready for the deferred types above.

**Test fixtures must avoid real catalog keys.** Every requirable key is seeded as a global
`FileType` row, so a test creating a *global* row with a real key trips the partial unique
index on `key WHERE organization IS NULL`. `storage/tests/models/test_requirements.py`
uses a synthetic `test_only_document` key for this reason; adding a catalog type that
collides with a test fixture will break those tests.
