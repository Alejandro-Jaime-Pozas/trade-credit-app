# IN DEPTH KYC, LOAN TERMS, CREDIT RISK MODELING

  1. KYC/AML
  2. loan terms reasoning (ideal interest rate, duration, monthly pmt)
  3. credit reasoning (put credit report numbers to use)

Love this problem space—Mexican loan origination has some very specific mechanics, and getting these concepts right is exactly what separates a toy model from something production-grade. I’ll walk through each concept as it’s typically used by Mexican lenders, focusing on:

Where it sits in the origination flow

How it affects approval vs. rejection

How it influences final loan terms

How you should think about modeling it in an automation / reasoning system

I’ll keep it conceptual (not vendor-specific) so you can translate this into rules, features, or ML later.

High-Level Origination Flow (Mexico-style)

Before diving into each concept, here’s the typical sequence for a Mexican lending company (banks, SOFOMes, fintechs):

KYC / AML (hard gate)

Identity & data validation

Credit bureau pull (Buró / Círculo)

Credit risk assessment

Loan terms construction

Final approval + contract generation

KYC/AML is mostly binary, while credit and terms are continuous + optimization problems.

1. KYC / AML (Know Your Customer / Anti-Money Laundering)
What it is in Mexico

KYC/AML is non-negotiable and tightly regulated by:

CNBV

Ley Fintech

Ley de Prevención de Lavado de Dinero (PLD/FT)

Typical KYC data:

Full legal name

CURP

RFC

Date of birth

Address (with proof)

INE (voter ID)

Selfie / liveness (fintechs)

Phone number validation

AML checks:

Blacklists (OFAC, local PEP lists)

Politically Exposed Person (PEP) flags

Sanctions & suspicious activity patterns

How it affects approval/rejection
Hard rejection triggers

Identity cannot be verified

CURP/RFC mismatch

Fake or expired INE

Customer is on a sanctions list

High-risk PEP with no enhanced due diligence

Important:
➡️ No amount of good credit can override a failed KYC/AML.

This is a blocking layer.

How it affects loan terms

Usually indirect, but in some lenders:

PEP → shorter duration

PEP → lower maximum amount

High AML risk → manual review → slower disbursement

How to model this in automation

Think of KYC/AML as:

KYC_STATUS = {PASS, FAIL, MANUAL_REVIEW}

Modeling tips

Treat KYC as a gate, not a score

If FAIL → stop pipeline

If MANUAL_REVIEW → branch workflow

Keep it explainable (regulators care)

Your model should never reason around KYC failures.

2. Loan Terms Reasoning

(Interest rate, duration, monthly payment)

This is where Mexican lenders do risk-based pricing, but with constraints.

What “loan terms reasoning” really means

Given:

Risk profile

Income & affordability

Product constraints

The lender must decide:

Loan amount

Interest rate (CAT-driven)

Term (months)

Monthly payment

In Mexico, terms are usually derived, not freely chosen.

Key Mexican constraints
1. Monthly payment affordability

Most lenders target:

30–40% of net monthly income

Some fintechs go up to 50% (high risk)

Monthly Payment ≤ Income × Affordability Ratio

2. Term affects risk non-linearly

Short term → higher monthly payment → rejection risk

Long term → more default risk → higher interest rate

So lenders optimize, not minimize.

3. Interest rate bands

Rates are not continuous—usually tiered:

Risk Tier	Monthly Rate
Low	1.5–2.5%
Medium	3–5%
High	6–10%+

Your model should reason in bands, not precise decimals.

How it affects approval/rejection

A borrower might:

Be credit-approved

But rejected on terms

Examples:

Approved risk, but payment > affordability

Only viable term requires rate above policy cap

Loan amount too small to justify operational cost

How to model this in automation

Treat terms as a feasible solution space problem.

Example reasoning steps

Determine max affordable payment

Try preferred term range

Compute implied interest rate

Check against policy bands

Adjust term → re-evaluate

If no feasible combo → reject

This is constraint satisfaction + optimization, not just math.

3. Credit Reasoning

(Turning bureau data into decisions)

This is the heart of origination.

Credit bureaus in Mexico

Buró de Crédito

Círculo de Crédito

Key data:

Credit score (300–850)

Number of active loans

Payment history (MOP codes)

Defaults, write-offs

Credit age

Utilization

How lenders actually reason (not just score)

Mexican lenders rely heavily on pattern recognition, not raw score.

Common rejection triggers

Recent MOP 4+ (late payments)

Defaults in last 12–24 months

Too many open loans

Very thin file (no history)

Soft negatives

High utilization

Short credit history

Multiple recent inquiries

Credit reasoning → risk tier

Most lenders map bureau data into risk buckets, not probabilities.

Example:

IF score > 700 AND no MOP ≥ 3 AND stable history
→ LOW RISK

IF score 600–700 OR minor delinquencies
→ MEDIUM RISK

IF score < 600 OR recent default
→ HIGH RISK / REJECT

How credit affects loan terms

Credit risk directly influences:

Interest rate

Max amount

Term length

Need for guarantor or payroll deduction

Examples:

High score → longer term + lower rate

Medium score → shorter term + higher rate

Thin file → small loan, high rate, short duration

How to model credit reasoning properly

Avoid:
❌ “Score > X = approve”

Instead model:

Behavioral signals

Recency weighting

Risk flags

Compensating factors

Think in explainable rules + learned weights.

How These 3 Work Together (Big Picture)
Layer	Role	Nature
KYC/AML	Legal gate	Binary
Credit Reasoning	Risk classification	Probabilistic / rules
Terms Reasoning	Feasibility & pricing	Optimization

Your automation model should reason in this order, not mix them.

If You’re Building an “Intelligent” Origination Model

Your system should be able to say things like:

“The applicant is credit-eligible but rejected due to affordability constraints at all allowed interest-rate tiers.”

Or:

“Approved at a higher rate because of recent MOP 2 events despite a strong score.”

That’s human-grade underwriting logic.

Want to go deeper?

Next useful deep dives could be:

Mexican credit bureau MOP codes (very important)

How CAT (Costo Anual Total) constraints affect pricing

Rule-based vs ML underwriting hybrids

Sample decision trees for a SOFOM vs fintech

If you want, tell me what type of lender you’re modeling (bank, payroll loan, BNPL, consumer fintech), and I’ll tailor this into a concrete origination logic blueprint.


# Below is how lenders actually decide what terms to offer to a business borrower,

Big picture: how Mexican business loans are priced

A lender answers four core questions:

Can the business repay? (capacity)

Will the business repay? (credit risk)

What could we recover if it doesn’t? (collateral & structure)

Is the return worth it vs alternatives? (pricing & capital constraints)

Every loan term flows from those.

1. Loan Amount (Monto del crédito)
Primary drivers
A. Repayment capacity (most important)

Mexican lenders usually cap the loan so that:

Debt Service Coverage Ratio (DSCR) ≥ 1.2x–1.5x

Or payment ≤ 20–35% of monthly free cash flow

Example:

Monthly free cash flow: $100,000 MXN

Max payment allowed (30%): $30,000 MXN

That payment size determines the maximum loan amount, not the other way around.

This alone can explain why someone gets $1.0M instead of $1.4M.

B. Revenue-based caps

Very common in SME lending:

Loan ≤ 10–30% of annual revenue

Or ≤ 2–4 months of sales

Example:

Annual revenue: $6M MXN

20% cap → max loan = $1.2M MXN

C. Collateral value (if applicable)

If secured:

Real estate: 50–70% LTV

Equipment: 40–60% LTV

Receivables: 60–85% advance rate

A borrower might qualify for $1.4M cash-flow-wise, but collateral only supports $1.0M.

D. Risk tier limits

Even “all else equal,” lenders impose hard caps per risk grade:

Risk grade	Max exposure
A	$2.0M
B	$1.4M
C	$1.0M
D	$500k

One small negative factor (industry volatility, short operating history) can drop a borrower one tier.

Why $1.4M vs $1.0M?

Common real reasons:

DSCR is 1.22x instead of 1.35x

Customer has thin cash buffers

Industry cap (e.g. restaurants, construction)

Bureau score just below threshold

Internal portfolio concentration limits

2. Annual Interest Rate (Tasa)
How rates are built in Mexico

Most lenders think in components, not a single number:

Interest Rate =
Base Rate + Risk Premium + Operating Margin + Capital Cost

A. Base rate

Usually tied to:

TIIE (28 days)

Or internal cost of funds

Example:

TIIE: 11.25%

Cost of funds: ~12–13%

B. Credit risk premium

Depends on:

Buró de Crédito / Círculo score

Payment history

Leverage

Industry risk

Formality of financials

Typical SME ranges:

Low risk: +4–6%

Medium risk: +8–12%

High risk: +15–30%+

C. Operating + margin

SME loans are expensive to service in Mexico:

Collections

Compliance (CNBV)

Manual underwriting

Adds another 3–6%

Typical SME rates (very rough)
Borrower quality	Annual rate
Prime SME	18–24%
Average SME	25–40%
High risk / thin file	45–80%+
3. Term (Plazo en meses)
Term is about cash flow fit + risk horizon
Shorter terms:

Higher payment

Lower default risk

Lower interest cost

Longer terms:

Easier cash flow

Higher risk

Higher total interest

How terms are chosen
Loan purpose	Typical term
Working capital	6–24 months
Equipment	24–60 months
Real estate	60–180 months
Revenue-based	3–12 months

A lender might force a shorter term if:

Business has volatile cash flows

Financials are weak

Industry is cyclical

They want faster principal recovery

4. Payment Amount (Pago)

This is derived, not decided independently:

Payment =
Loan amount + interest
----------------------
Number of periods


But lenders back into it by:

Setting max payment as % of cash flow

Then adjusting loan amount or term until it fits

5. Other key loan components in Mexico
A. Fees

Origination: 1–5%

Opening commission (comisión por apertura)

Sometimes deducted upfront

B. Guarantees

Avales personales (very common)

Joint & several liability

Sometimes spouse signature

C. Covenants

Minimum cash balance

No additional debt

Reporting requirements

D. Prepayment penalties

Common in fixed-rate loans

Less common in fintech loans

Why lenders don’t always give the max amount

Even if the borrower qualifies:

Portfolio risk management

Regulatory capital constraints

Industry concentration limits

Behavioral risk (new customer vs repeat)

Loss severity concerns

Stress scenarios (what if revenue drops 20%?)

Sometimes $1.0M is simply the safe bet.

Mental model to remember

Think of Mexican SME underwriting as:

“What’s the largest loan this business can survive during a bad year—and still pay us?”

Everything flows from that.
