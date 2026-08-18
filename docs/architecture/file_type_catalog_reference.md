# File type catalog — full reference

The complete set of document types identified as relevant to Mexican trade credit
underwriting, whether or not they are implemented yet.

**This file is a reference list, not a source of truth.** The source of truth for what the
app actually knows about is `backend/core/file_type_catalog.py`. This document exists so
the types deferred out of v1 are not lost, and so the reasoning behind each row survives.

Sources: existing catalog, `docs/versions/v2.md` candidates, and two requirement lists
supplied by the product owner (2026-08-17) — a general trade-credit scope list and a
lender's actual document checklist.

## How to read this

- **v1** — shipping now. Add to `FILE_TYPE_CATALOG`, run `manage.py sync_file_types`.
- **Deferred** — not in v1. Implement later by moving the row into the catalog; nothing
  else about it needs re-deciding.
- **P** (presence-only) — nothing useful to extract. The app only needs to know a document
  of this type exists. Uses the shared presence-only pydantic model rather than its own.
- **G** (equivalence group) — several different documents prove the same fact, and any one
  of them satisfies the requirement.
- **Category** is a *recency bucket*, not a UI grouping — it decides how stale a document
  may be and still count (`MAX_MONTHS_BACK_BY_CATEGORY` in `core/file_type_spec.py`:
  financial 2 months, legal 3, other unlimited). The section headings below are for human
  reading only; each row still carries one of the three existing categories. A new category
  would silently get no recency limit and would be invisible to the hardcoded
  FINANCIAL/LEGAL pair read at module level in `processing/services/credit_case.py`.

---

## Financial — category `FINANCIAL`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `balance_sheet` | Balance general | **v1** | already shipped |
| `income_statement` | Estado de resultados | **v1** | already shipped |
| `cashflow_statement` | Estado de flujo de efectivo | **v1** | already shipped |
| `bank_statement` | Estado de cuenta bancario | **v1** | already shipped |
| `estados_financieros_dictaminados` | Estados financieros auditados | Deferred | audited/dictaminados; required above a size threshold |
| `estados_financieros_internos` | Estados financieros internos | Deferred | current-year partials, between annual closes |
| `caratula_estado_de_cuenta` | Carátula de estado de cuenta | Deferred (P) | cover page only — account holder, number, CLABE. Verifies *whose* account it is; distinct from `bank_statement`, which is 12 months of transactions for cashflow analysis |
| `antiguedad_saldos_cxc` | Antigüedad de saldos por cobrar | Deferred | AR aging |
| `antiguedad_saldos_cxp` | Antigüedad de saldos por pagar | Deferred | AP aging |
| `relacion_de_deuda` | Relación de créditos vigentes | Deferred | debt schedule — existing obligations |
| `proyecciones_financieras` | Proyecciones financieras | Deferred | forward-looking, not historical evidence |
| `relacion_activos_fijos` | Relación de activos fijos | Deferred | |
| `estado_financiero_personal` | Estado financiero personal | Deferred | for an aval or persona física con actividad empresarial |
| `cedula_profesional_contador` | Cédula profesional del contador | Deferred (P) | verifies who signed the financials |

## Tax / SAT — category `LEGAL`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `constancia_de_situacion_fiscal` | Constancia de situación fiscal | **v1** | already shipped. **G:** `registro_fiscal` |
| `alta_hacienda_r1` | Alta en Hacienda (R1) | Deferred | **G:** `registro_fiscal`. Older companies hold an R1; newer ones only ever get a CSF |
| `cedula_identificacion_fiscal` | Cédula de identificación fiscal | Deferred | **G:** `registro_fiscal`. Same underlying fact as the CSF, different artifact |
| `opinion_de_cumplimiento` | Opinión de cumplimiento (32-D) | **v1** | must be *positiva* |
| `declaracion_anual` | Declaración anual | **v1** | distinct from the provisional/monthly filings below |
| `declaraciones_provisionales` | Declaraciones provisionales IVA/ISR | **v1** | |
| `cfdi_facturas` | CFDI de ingresos (facturas) | **v1** | |
| `cfdi_nomina` | CFDI de nómina | **v1** | payroll — corroborates headcount |
| `declaracion_anual_personal` | Declaración anual persona física | **v1** | |
| `constancia_no_adeudo_imss` | Constancia de no adeudo IMSS | **v1** (P) | labor liability exposure |
| `alta_imss` | Alta patronal IMSS | **v1** (P) | validates claimed employee count against something official |

## Legal / corporate — category `LEGAL`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `acta_constitutiva` | Acta constitutiva | **v1** | |
| `actas_de_asamblea` | Actas de asamblea / modificaciones | **v1** | amendments since incorporation. The original acta can be decades stale — this is where restructurings show up |
| `folio_mercantil` | Folio mercantil (RPPC) | Deferred (P) | proof the acta is actually registered |
| `poder_notarial` | Poder notarial de apoderados | **v1** | |
| `identificacion_oficial` | Identificación oficial | **v1** | INE, pasaporte, or licencia — see the equivalence-group note below |
| `curp` | CURP | **v1** (P) | |
| `comprobante_de_domicilio` | Comprobante de domicilio | Deferred | general proof of address (CFE, agua, predial) |
| `comprobante_domicilio_comercial` | Comprobante de domicilio comercial | **v1** | the operating address, often different from the fiscal one — for trade credit this is where the goods actually go |
| `declaracion_beneficiario_controlador` | Declaración de beneficiario controlador | Deferred (P) | a distinct SAT filing since the 2022 CFF Art. 32-B Ter reform, not merely UBO data |

## Credit process — category `OTHER`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `solicitud_de_credito` | Solicitud de crédito firmada | Deferred (P) | the signed application itself |
| `carta_autorizacion_buro` | Autorización de consulta a Buró | Deferred (P) | written consent required under the Ley para Regular las Sociedades de Información Crediticia. See the open-gap note below |
| `reporte_buro_de_credito` | Reporte de Buró de Crédito | Deferred | |
| `referencias_comerciales` | Referencias comerciales | **v1** | trade references from the applicant's *other* suppliers. The most trade-credit-specific document in this list — direct evidence of payment behaviour with peers, which Buró does not capture |
| `referencias_bancarias` | Referencias bancarias | Deferred | |
| `aviso_privacidad_firmado` | Aviso de privacidad firmado | Deferred (P) | |
| `contrato_de_credito` | Contrato de crédito | Deferred (P) | |
| `pagare` | Pagaré | **v1** (P) | the enforceable instrument — what lets you actually collect |

## Collateral / aval — category `LEGAL`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `escritura_inmueble` | Escritura del inmueble | Deferred | property deed |
| `certificado_libertad_gravamen` | Certificado de libertad de gravamen | Deferred | issued by the RPP; proves no liens on the property |
| `avaluo` | Avalúo | Deferred | appraisal |
| `poliza_de_seguro` | Póliza de seguro | Deferred (P) | insurance on the collateral |
| `inscripcion_rug` | Inscripción en el RUG | Deferred (P) | movable-collateral lien registry |

## Operational — category `OTHER`

| key | Label ES | Status | Notes |
|---|---|---|---|
| `fotografias_establecimiento` | Fotografías del establecimiento | **v1** (P) | standard *visita ocular* practice in Mexican SME lending. `ALLOWED_FILE_EXTENSIONS` already permits jpg/jpeg/png. The one type where GPT vision could do real verification rather than field extraction |
| `orden_de_compra` | Orden de compra / contrato de suministro | Deferred (P) | establishes the commercial relationship the credit sits on |

---

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

**Equivalence groups have no v1 member.** `registro_fiscal` was the motivating case
(R1 / Cédula Fiscal / CSF all prove RFC registration), and both alternatives are deferred,
leaving the group with one member. `identificacion_oficial` is a single key covering three
physical forms, so it needs no group either. Revisit when the deferred tax rows land.

**Per-person requirements.** `unique_file_type_per_credit_case` allows one requirement row
per type per case, and completion compares *sets* of keys — so a single uploaded ID
satisfies "identificación oficial" no matter how many people need one. Real requirements
read "de solicitante y aval(es)" and "of all beneficial owners". v1 addresses this with a
`quantity` field counting uploads; the full fix is modelling the people (`Aval`,
`BeneficialOwner`) and attaching requirements per person.

**`months_required` is advisory, not enforced.** `CreditCase.missing_file_type_names`
(`processing/models.py`) is a plain set difference with a TODO on it, so `bank_statement`'s
`months_required=12` is currently satisfied by one statement. Month-coverage machinery
exists (`check_aggregate_satisfied_month_intervals`) but lives on `AccountApplication` and
is gated on `type == 'loan'`. Deliberately left alone for v1. Also unresolved: the field
counts months, but "2 fiscal years of audited financials" is 2 annual documents, not 24.

**Buró consent gap.** `processing/choices_for_models.py` has a `BURO_DE_CREDITO_REJECTED`
status and there is a `buro_de_credito` integration, but `carta_autorizacion_buro` is
deferred — so nothing records the legally required consent before a report is pulled.
Deliberate for v1; close it before the Buró integration goes live.

**UI grouping.** With this many types the chooser needs the section headings above, but
`category` cannot carry them (it means recency). That requires a separate display field on
`FileTypeSpec` — cosmetic, deferred.
