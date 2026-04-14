# Loan Terms model relationship, determining loan term months, interest rate, payment

Perfect — this is the core of lending math. Once you understand this relationship clearly, your backend becomes deterministic and stable.

We will break this into:

The math relationship

What lenders actually control

How financial and credit data determine each variable

How to design your pricing engine logically

1️⃣ The Core Mathematical Relationship

There are four variables in an amortized loan:

Principal (loan amount)

Interest rate

Term (number of months)

Payment (monthly payment)

They are mathematically linked. If you fix any three, the fourth is determined.

The standard amortization formula is:

Monthly payment equals:

Principal × monthly rate
divided by
(1 minus (1 + monthly rate) raised to negative term)

In plain words:

Payment increases when:

Principal increases

Interest rate increases

Term decreases

Payment decreases when:

Term increases

2️⃣ What Lenders Actually Decide

In real underwriting, lenders do not randomly choose all four.

They usually determine them in this order:

Interest rate (based on risk)

Maximum affordable payment (based on cash flow)

Allowed term (based on product and risk)

Principal is calculated from the above

So the principal is often the result, not the starting point.

3️⃣ How Financial and Credit Data Determine Each Variable

Now let’s connect underwriting logic to math.

A) Payment (Affordability Constraint)

This comes from financial statements and bank statements.

Lenders often use something like:

Maximum payment = 30–40 percent of net free cash flow

Or they use debt service coverage ratio rules:

Cash flow must be 1.25 times total debt payments

So payment is primarily determined by:

Net operating income

Existing debt payments

Volatility of cash flow

Seasonality

This is the most important anchor in your system.

B) Interest Rate (Risk Pricing)

Interest rate is determined by:

Personal and business credit profile

Profitability

Leverage

Industry risk

Collateral

Size of loan relative to revenue

Macroeconomic base rate (central bank policy rate)

You can model it like:

Interest rate = base market rate + risk premium

Where risk premium depends on:

Credit tier

Cash flow stability

Collateral coverage

Term length

Better borrower → smaller risk premium.

C) Term (Risk + Product Policy)

Term is constrained by:

Product type (working capital vs equipment)

Risk tier

Cash flow volatility

Useful life of asset (if secured)

Higher risk borrowers usually get:

Shorter terms

Higher payments

Lower risk borrowers get:

Longer terms

Lower payments

Term is not random — it is a policy decision.

D) Principal (Result of Everything Above)

Once you know:

Maximum payment

Interest rate

Term

Principal is determined by the formula.

This is why your model was producing wildly different loan amounts earlier — because the system was implicitly varying term and rate, which drastically changes principal for the same payment capacity.

4️⃣ How to Build This Deterministically

Here is a clean underwriting flow:

Step 1
Extract financial profile:

Monthly free cash flow

Existing debt

Revenue

Collateral value

Credit tier

Step 2
Determine risk tier (A, B, C, D style internally)

Step 3
Set pricing from tier:

Tier A: base rate + 3 percent

Tier B: base rate + 6 percent

Tier C: base rate + 10 percent

Step 4
Set term range by tier:

Tier A: up to 60 months

Tier B: up to 36 months

Tier C: up to 24 months

Step 5
Calculate maximum payment:

Example: 35 percent of net free cash flow

Step 6
For each allowed term:

Calculate maximum principal

Choose the one that matches your objective:

Maximize loan amount?

Minimize total interest?

Balance both?

Now the output becomes stable and policy-driven.
