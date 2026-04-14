What you’re seeing is totally expected when the problem is under-constrained: for the same borrower data there are many “reasonable” loan packages (amount/term/rate) that keep payment under an affordability cap, so the model will happily pick different optima run-to-run.

To fix it, you want (1) determinism in sampling and (2) a deterministic decision layer (math/code) that makes the final choice.

1) Make the model as reproducible as possible

Even before you change your logic:

Set temperature: 0 (and keep other sampling params constant).

If you’re using OpenAI’s API, use the seed parameter for reproducible outputs and track system_fingerprint (it helps detect backend changes that can slightly affect outputs).

Use Structured Outputs (JSON Schema) so the model can’t drift format-wise and you can enforce enums/ranges.

This reduces randomness, but it won’t solve “multiple valid answers” by itself.

2) Stop asking the LLM to decide the loan. Ask it to extract inputs.

Make the LLM do what it’s good at:

reading messy docs

extracting numbers

explaining rationale in words

…and make your backend do what it’s good at:

amortization math

optimization

constraint satisfaction

A strong pattern:

Step A (LLM): extract a normalized borrower profile:

net free cash flow (monthly)

existing debt payments

income volatility flag

credit score band / risk tier

desired amount (if any)

hard constraints (min/max term, max payment ratio, etc.)

Step B (Code): generate candidate loans and pick the best deterministically.

Step C (LLM optional): generate the narrative explanation from the chosen package + computed metrics.

3) Make your objective function explicit (this is the real fix)

Right now your model is implicitly optimizing something different each time.

You already have the key constraint:

monthly payment should be 30–40% of net free cash

Turn that into hard rules + a single objective. Example:

Constraints

payment ≤ 0.35 * net_free_cash (pick one number, not a range, or make the range a policy)

term ∈ {12, 18, 24, 36, 48, 60}

rate comes from a risk-tier table (deterministic mapping from credit score + other risk features)

Objective (pick ONE primary goal)
Choose one:

maximize loan amount (within constraints)

minimize total interest paid

minimize APR (subject to minimum loan amount)

maximize approval likelihood (more conservative amount/term)

If you don’t pick, the model will.

4) Deterministic loan math (what your code should do)

For each candidate (rate, term) compute the max principal allowed by the payment cap.

Amortization formula:

Monthly rate: r = annual_rate / 12

Payment: PMT = P * r / (1 - (1+r)^(-n))

Solve for principal: P = PMT * (1 - (1+r)^(-n)) / r

Then:

PMT_cap = policy_ratio * net_free_cash

For each n in allowed terms:

compute P_max(n, r) from PMT_cap

round down to your lending increments (e.g., nearest 10,000 MXN)

compute total paid, total interest, etc.

Select the winner by your objective.

This will immediately eliminate cases where the model sometimes proposes 750k/36 @18% vs 1M/36 @11% without a consistent reason—because your selector will always choose the same candidate given the same inputs/policy.

5) Use Structured Outputs to enforce policy + reduce “creative” drift

Even if you keep the LLM in the loop, constrain the space:

Require it to output:

policy_payment_ratio (enum: 0.30, 0.35, 0.40)

risk_tier (enum like A/B/C/D)

allowed_terms (fixed set)

chosen_objective (enum)

Then your code chooses the package.

Structured Outputs is specifically designed to keep outputs aligned to your JSON Schema.
(If you’re using function calling, pay attention to “strict” behavior differences across APIs; Responses tends to normalize schemas to strict mode.)

6) Testing: build a small eval set

Create ~50 representative borrower cases and lock:

extracted profile JSON (ground truth)

expected loan package given your policy

Then run regressions whenever you tweak prompts/models. OpenAI’s Evals examples for structured outputs are a good starting point.
