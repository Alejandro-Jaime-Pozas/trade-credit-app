# Risk Monitoring Automation POST LOAN ORIGINATION, during loan term..

The Key Realization You Just Had

Loan origination doesn’t end at approval.

In reality, a serious Mexican lender is doing continuous risk monitoring for the entire life of the loan.

What you’re describing sits in a space called:

Post-origination monitoring / ongoing underwriting / dynamic risk management

This is separate from onboarding, but tightly connected to it.

Onboarding vs Ongoing Monitoring (Big Distinction)
During onboarding

You collect:

Bank statements (last 3–6 months)

Income proofs

Tax filings (sometimes)

Credit bureau snapshot

This is a static snapshot.

After onboarding (monthly / ongoing)

You should be asking:

Has income dropped?

Has spending behavior changed?

Are there early stress signals?

Did the company’s payroll behavior change?

Is the borrower accumulating more debt elsewhere?

This is time-series risk, not point-in-time risk.

Most lenders are bad at this. That’s the opportunity.

How This Is Supposed to Be Done (In Theory)
1. Open Banking (Ideal World)

In theory:

Open Banking gives you continuous access to:

Balances

Transactions

Income inflows

Payment behavior

In practice (especially in Mexico):

Coverage is incomplete

Data quality varies

Not all employers or banks cooperate

Corporate data is even harder than individual data

So Open Banking helps — but it’s not enough by itself.

The Reality You Pointed Out (Very Important)

“You probably need to stay in contact with the accountants of each client company”

Yes. This is absolutely true, especially for:

Payroll lending

SME lending

Embedded finance

Corporate-backed consumer loans

What actually happens in Mexico:

Lenders rely on:

Employer payroll files

Monthly accounting exports

HR / finance contacts

This data is semi-manual, semi-structured

This is messy — but extremely powerful if automated correctly.

What “Analyzing Changes” Really Means

This is where Sol Bank (or a system like it) becomes interesting.

You’re not just checking values — you’re detecting deltas.

Examples of meaningful changes

Income dropped 20% month-over-month

Salary payment date starts drifting

More failed payments than usual

Expenses spike suddenly

Employer delays payroll

New debt obligations appear

These are early warning signals, not defaults.

How Lenders Use This Information
1. Risk monitoring (primary use)

Adjust internal risk score

Flag accounts for review

Increase collections attention

Trigger proactive outreach

2. Terms management (advanced lenders)

Freeze additional credit

Reduce credit line

Increase reserve provisioning

Offer refinancing before delinquency

3. Regulatory / capital reasons

Adjust expected loss (ECL)

Update IFRS 9 staging

Report portfolio health to regulators/investors

How This Fits Into a Smart Automation Model

You now have two distinct but connected models:

Model A — Origination Model

One-time (or infrequent)

Heavy on KYC + bureau

Outputs:

Approve / reject

Initial terms

Model B — Monitoring Model

Continuous / monthly

Heavy on transactions + payroll + accounting

Outputs:

Risk trend

Alerts

Intervention recommendations

They should not be the same model, but they must talk to each other.

How to Reason About This in an AI System

Your AI should be able to say things like:

“The borrower was approved based on stable income, but the last two payroll cycles show a 15% income drop and delayed deposits, increasing short-term default risk.”

Or:

“Spending volatility increased while fixed obligations remained constant — early liquidity stress detected.”

This is causal + temporal reasoning, not just classification.

Why This Is Hard (and Valuable)

Data sources are fragmented

Accountants ≠ APIs

Formats change

Trust relationships matter

You need explainability (especially in regulated finance)

Most fintechs either:

Ignore this layer, or

Do it manually with analysts

Automating this is a huge competitive edge.

Where Sol Bank (or GPT-powered systems) Fit Perfectly

A system like Sol Bank could:

Normalize messy monthly data

Compare month-over-month deltas

Translate accounting data → risk signals

Generate human-readable explanations

Decide when a human needs to step in

That’s not “just Open Banking” — that’s financial intelligence.

What I meant by “Most lenders are bad at this”

I’m not saying lenders are careless or incompetent.

I’m saying that structurally and historically, most lenders are not set up to do continuous, automated, high-quality post-origination monitoring — especially in Mexico.

This isn’t opinion-y; it comes from how lending systems evolved.

1. Lending Was Designed as a “Snapshot” Business

Traditional lending logic is:

“Decide once, then collect.”

So systems are optimized for:

Heavy analysis before approval

Very little intelligence after disbursement

Once a loan is approved:

The credit model is “done”

Monitoring is mostly:

“Did they pay this month? yes/no”

“Are they delinquent?”

That’s not the same as risk monitoring — it’s collections monitoring.

2. Post-Origination Monitoring Is Usually Manual or Crude

When lenders do try to monitor:

It’s often:

Excel reports

Monthly PDFs

Analyst intuition

Static thresholds (“if balance < X → alert”)

Very rarely:

Continuous

Behavioral

Context-aware

Automated with reasoning

Even many fintechs still do this semi-manually.

3. Open Banking Did Not Magically Fix This (Yet)

This is key to your earlier insight.

Open Banking promised:

Continuous data

Real-time visibility

But in practice (especially in MX):

Coverage is uneven

Corporate data is harder than individual

Payroll flows are not standardized

Data is noisy and inconsistent

So lenders still fall back to:

Accountants

Payroll files

HR exports

Manual follow-ups

Which breaks automation.

4. Incentives Also Work Against Doing This Well

This is uncomfortable but important:

Origination teams are rewarded for growth

Risk teams are rewarded for loss control

Monitoring sits awkwardly in the middle

So monitoring becomes:

Underfunded

Reactive

Focused on late-stage delinquency

Early-warning intelligence doesn’t always have a clear owner.

5. Why This Creates an “Opportunity”

Because if a lender could:

Automatically ingest messy monthly data

Detect meaningful changes (not noise)

Explain why risk is increasing

Trigger early, proportional actions

They would:

Reduce defaults

Intervene earlier

Price risk more accurately

Offer refinancing instead of collections

Look much better to regulators and investors

Very few do this systematically today.

6. What I Am NOT Saying

To be clear, I’m not saying:

“Lenders don’t monitor risk”

“No one is doing this”

“This is easy”

I am saying:

Most monitoring is shallow

Most insight comes too late

Most systems can’t reason about change over time

Which is exactly what you started noticing on your own.

Why Your Question Matters

You didn’t just accept the statement — you asked why.

That’s the right instinct if you’re building:

An automation model

A product

Or a new lending capability

Because the real insight isn’t “lenders are bad”
It’s:

Lending infrastructure wasn’t built for continuous reasoning — but it now can be.

That gap is what systems like the one you’re imagining can fill.
