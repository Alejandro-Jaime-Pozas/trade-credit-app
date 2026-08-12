# Prompt — credit cases column filter + sort

Date: 2026-08-09 16:38:48
Feature: per-column filter/sort controls on `/credit-cases`

## User prompt (verbatim)

> create plan for the following for the http://localhost:3000/credit-cases endpoint.
>
> users can filter view by status, date, etc (status filter only, client-side; no date-based sort/filter).
> there should be two small buttons beside each col (except ID col). 1 button to filter that field, another to sort that field.
> sort button should first sort ascending, then descending if clicked again, then back to the default if clicked again.
> filter button should open a dropdown menu with the values so user can choose one or more, or user can search to select a value. if user searches and selects a value, the user can delete that search but the value they selected should remain active, and user can then select more values via search without values being wiped from memory.
>
> Plan this out and put the instructions below the "user can filter view by..." in '/Users/Alex/Documents/Coding/Applications/trade_credit_app/docs/versions/v1.md'. LMK if you have questions to clarify.

Context: the user had `docs/versions/v1.md` line 92 selected —
`- [ ] users can filter view by status, date, etc (status filter only, client-side; no date-based sort/filter)`

## Clarifying questions asked and answered

1. **CREATED column filter granularity** (full timestamps would make every row its own value).
   Answer: relative-day presets — `today, last 2, 3, 4, 5, 6, 7, 10, 14, 30, 60, 90, 180, 365`.
2. **REQUESTED column filter** (the cell mixes amount + currency + term).
   Answer: split into two columns, `REQUESTED AMOUNT` and `REQUESTED TERM`.
   Amount buckets: `> 10000000, > 1000000, > 500000, > 100000, > 50000`.
   Term: the different terms available in the data.
3. **Scope**. Answer: write the spec into `docs/versions/v1.md`, then implement it.
