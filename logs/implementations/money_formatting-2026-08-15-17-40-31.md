# Implementation — site-wide money formatting

Date: 2026-08-15

## Problem

The dashboard showed `MXN 1,500,000.00` while the credit case detail page showed
`1500000.00`. Not a missed `formatMoney` call: the detail page wasn't *displaying* money at all, it
was an editable `<input>` bound to the raw string. Display and editing are different problems, so
one shared function was never going to cover both.

## `lib/money.ts` (new) — the rules

Money is a plain decimal STRING everywhere it travels, exactly as DRF serializes it. DRF sends
decimals as strings because a JS number can't represent every decimal exactly, and rounding drift in
a credit limit is a real cost. Numbers are only for display and sorting, never on the way back to
the API.

Two shapes for one value:

    canonical  "1500000.00"    what the API sends and receives
    grouped    "1,500,000.00"  what a person reads

- `sanitizeMoneyTyping` — runs per keystroke, so it must let half-finished input through
  (`"1500."`, `"-"`). Strips separators and symbols rather than rejecting them, so pasting
  `"$1,500,000.00"` works. Caps decimals at two, keeps only the first decimal point, keeps a minus
  only at the front.
- `normalizeAmount` — the blur-time tidy: `"1500."` → `"1500.00"`, junk → `""` (which callers send
  as null). Cannot round money away, because decimals are already capped before it runs.
- `toEditableAmount`, `parseAmount`, `formatAmountGrouped`, `MONEY_LOCALE`, `MONEY_DECIMALS`.

`lib/format.ts` and `lib/tableControls.ts` now source their locale and `parseAmount` from here, so
there is one definition of what an amount is.

## `<Money>` (new) — display

Thin wrapper over `formatMoney`, but the point is having one obvious thing to reach for. Takes
`currency` from the record rather than a constant, since the field varies per case. `tabular-nums`
so amounts line up down a column.

## `<MoneyInput>` (new) — editing

Changes shape at the edges of editing rather than during it, which sidesteps caret arithmetic
entirely:

    not focused   1,500,000.00   grouped, readable
    focused       1500000.00     plain, types like a normal number field
    on blur       1,500,000.00   grouped again, normalised to 2 decimals

`onChange` always reports the canonical string, never the grouped text — a stray comma would be
rejected by the API or silently truncate the amount.

The draft is held in state and the displayed text is *derived* (`draft ?? formatAmountGrouped(value)`)
rather than synced from props in an effect: an effect repaints a frame late, and
`react-hooks/set-state-in-effect` rejects the synchronous setState that would avoid that.

Not `type="number"` — that brings spinners, scroll-wheel edits, and browser-driven reformatting.

## Wiring

- `CreditCaseTable` → `<Money value={cc.requested_amount} currency={cc.currency} />`
- `credit-cases/[id]` and `credit-cases/new` → `<MoneyInput>`, replacing the hand-rolled
  `inputMode="decimal"` boxes.

## Enforcement — `lib/money.enforcement.test.ts` (new)

Everything above is a convention until something enforces it, and a convention is exactly what
failed here. This scans the source and fails when a new site formats or parses money by hand:

1. `formatMoney` called outside `<Money>` / `lib/format.ts`
2. a money `Intl.NumberFormat` built outside `lib/money.ts` / `lib/format.ts`
3. `inputMode="decimal"` outside `<MoneyInput>` — the fingerprint of a hand-rolled money box
4. a raw `.requested_amount` interpolated into JSX
5. the number-formatting locale hardcoded outside `lib/money.ts` (`localeCompare` exempt — text
   collation is a separate concern)

Each failure message names the file and says what to use instead. A source scan rather than an
ESLint rule because it needs no new tooling and runs in the suite everyone already runs; worth
promoting to a real rule if money spreads to many more fields.

**Verified it actually catches things**, rather than passing vacuously: temporarily added an
`inputMode="decimal"` input to the customer page, confirmed the test failed and named that file,
then restored the file and confirmed it passed again. There is also a guard asserting the file walk
found something, since a broken walk would make every rule pass silently.

## Tests

Frontend **242 passed** (was 204), 20 files. Backend unchanged at 174 passed / 6 skipped.

- `lib/money.test.ts` (19) — the half-finished typing states, paste handling, decimal capping,
  padding, and that normalisation can't round money away.
- `components/MoneyInput.test.tsx` (13) — the grouped/plain shape change on focus and blur, that
  every emitted value is canonical and comma-free, clearing reports `""`, paste of a formatted
  amount, and a parent replacing the value (Discard changes) showing through.
- `lib/money.enforcement.test.ts` (6) — the rules above.

`npx tsc --noEmit` and `npm run lint` clean. All four affected routes return 200.

## Note

The Docker containers were removed by something outside this session partway through; I ran
`docker compose up -d` to bring them back before verifying the routes.

## Not verified

No browser automation, so the field's feel while typing — the focus/blur shape change in particular
— is covered by tests but not seen.
