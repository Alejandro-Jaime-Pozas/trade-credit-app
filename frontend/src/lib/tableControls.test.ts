/**
 * Tests for the credit cases table's sort/filter logic (src/lib/tableControls.ts).
 *
 * These functions decide what the user actually sees in the table, and several
 * of them have easy-to-get-wrong edges: the three-step sort cycle, nulls that
 * must never float to the top, calendar-day (not 24-hour) date windows, and
 * overlapping ranges that have to union rather than intersect.
 */
import { describe, expect, it } from "vitest";
import {
  AMOUNT_BUCKETS,
  compareValues,
  DEADLINE_BUCKETS,
  DEADLINE_OVERDUE,
  isWithinLastDays,
  matchesDeadlineBuckets,
  matchesAmountBuckets,
  matchesRelativeDays,
  nextSortState,
  NO_VALUE,
  parseAmount,
  RELATIVE_DAY_OPTIONS,
  searchOptions,
  sequenceIndex,
  STATUS_SEQUENCE,
  toggleValue,
  VERDICT_SEQUENCE,
  type FilterOption,
} from "./tableControls";

describe("nextSortState", () => {
  it("cycles ascending -> descending -> default on the same column", () => {
    const first = nextSortState(null, "status");
    expect(first).toEqual({ columnId: "status", direction: "asc" });

    const second = nextSortState(first, "status");
    expect(second).toEqual({ columnId: "status", direction: "desc" });

    // Third click returns the table to its default (unsorted) order.
    expect(nextSortState(second, "status")).toBeNull();
  });

  it("restarts at ascending when a different column is clicked", () => {
    const sortedDesc = { columnId: "status", direction: "desc" as const };
    expect(nextSortState(sortedDesc, "created")).toEqual({
      columnId: "created",
      direction: "asc",
    });
  });
});

describe("compareValues", () => {
  it("orders numbers in both directions", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
  });

  it("orders strings case- and accent-insensitively", () => {
    expect(compareValues("acme", "Beta", "asc")).toBeLessThan(0);
    expect(compareValues("Ángel", "Bruno", "asc")).toBeLessThan(0);
  });

  it("sinks missing values to the bottom regardless of direction", () => {
    // A row with no value must never lead the table just because the user
    // flipped the sort to descending.
    for (const direction of ["asc", "desc"] as const) {
      expect(compareValues(null, 5, direction)).toBeGreaterThan(0);
      expect(compareValues(5, null, direction)).toBeLessThan(0);
      expect(compareValues(undefined, "a", direction)).toBeGreaterThan(0);
      expect(compareValues("", "a", direction)).toBeGreaterThan(0);
    }
    expect(compareValues(null, undefined, "asc")).toBe(0);
  });
});

describe("searchOptions", () => {
  const options: FilterOption[] = [
    { value: "acme", label: "Acme Corp", count: 2 },
    { value: "beta", label: "Beta SA", count: 1 },
  ];

  it("returns everything for an empty query", () => {
    expect(searchOptions(options, "")).toHaveLength(2);
    expect(searchOptions(options, "   ")).toHaveLength(2);
  });

  it("matches case-insensitively on the label", () => {
    expect(searchOptions(options, "ACM")).toEqual([options[0]]);
    expect(searchOptions(options, "sa")).toEqual([options[1]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(searchOptions(options, "zzz")).toEqual([]);
  });
});

describe("toggleValue", () => {
  it("adds a value that isn't selected and removes one that is", () => {
    expect(toggleValue([], "a")).toEqual(["a"]);
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("does not mutate the array it is given", () => {
    const selected = ["a"];
    toggleValue(selected, "b");
    expect(selected).toEqual(["a"]);
  });
});

describe("isWithinLastDays", () => {
  // Mid-afternoon, so a naive 24-hour implementation would disagree with a
  // calendar-day one and the boundary assertions below would catch it.
  const now = new Date(2026, 7, 9, 15, 30); // 2026-08-09 local time

  function daysAgo(n: number, hour = 9): string {
    return new Date(2026, 7, 9 - n, hour).toISOString();
  }

  it("treats days = 0 as today only", () => {
    expect(isWithinLastDays(daysAgo(0), 0, now)).toBe(true);
    // Earlier today, before "now" — still today.
    expect(isWithinLastDays(daysAgo(0, 1), 0, now)).toBe(true);
    expect(isWithinLastDays(daysAgo(1), 0, now)).toBe(false);
  });

  it("counts today as day 1 of an N-day window", () => {
    expect(isWithinLastDays(daysAgo(0), 7, now)).toBe(true);
    expect(isWithinLastDays(daysAgo(6), 7, now)).toBe(true);
    // Day 7 back is outside a 7-day window that includes today.
    expect(isWithinLastDays(daysAgo(7), 7, now)).toBe(false);
  });

  it("is false for missing, unparseable, and future dates", () => {
    expect(isWithinLastDays(null, 30, now)).toBe(false);
    expect(isWithinLastDays(undefined, 30, now)).toBe(false);
    expect(isWithinLastDays("not-a-date", 30, now)).toBe(false);
    expect(isWithinLastDays(daysAgo(-1), 30, now)).toBe(false);
  });
});

describe("matchesRelativeDays", () => {
  const now = new Date(2026, 7, 9, 15, 30);
  const tenDaysAgo = new Date(2026, 6, 30, 9).toISOString();

  it("matches everything when nothing is selected", () => {
    expect(matchesRelativeDays(tenDaysAgo, [], now)).toBe(true);
  });

  it("unions overlapping presets so the widest window wins", () => {
    expect(matchesRelativeDays(tenDaysAgo, ["7"], now)).toBe(false);
    expect(matchesRelativeDays(tenDaysAgo, ["7", "30"], now)).toBe(true);
  });

  it("offers Today plus the agreed set of windows", () => {
    expect(RELATIVE_DAY_OPTIONS[0]).toEqual({ value: "0", label: "Today" });
    expect(RELATIVE_DAY_OPTIONS.map((o) => o.value)).toEqual([
      "0", "2", "3", "4", "5", "6", "7", "10", "14", "30", "60", "90", "180", "365",
    ]);
  });
});

describe("parseAmount", () => {
  it("parses DRF's decimal strings and rejects junk", () => {
    expect(parseAmount("1500000.00")).toBe(1500000);
    expect(parseAmount(250)).toBe(250);
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("matchesAmountBuckets", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesAmountBuckets("1000", [])).toBe(true);
    expect(matchesAmountBuckets(null, [])).toBe(true);
  });

  it("applies a bucket as a strict greater-than threshold", () => {
    expect(matchesAmountBuckets("600000", ["500000"])).toBe(true);
    expect(matchesAmountBuckets("500000", ["500000"])).toBe(false);
    expect(matchesAmountBuckets("400000", ["500000"])).toBe(false);
  });

  it("unions overlapping buckets so the lowest threshold wins", () => {
    expect(matchesAmountBuckets("600000", ["1000000"])).toBe(false);
    expect(matchesAmountBuckets("600000", ["1000000", "500000"])).toBe(true);
  });

  it("matches null amounts only via the No amount option", () => {
    expect(matchesAmountBuckets(null, ["50000"])).toBe(false);
    expect(matchesAmountBuckets(null, [NO_VALUE])).toBe(true);
    expect(matchesAmountBuckets("60000", [NO_VALUE])).toBe(false);
  });

  it("offers the agreed thresholds plus a No amount option", () => {
    expect(AMOUNT_BUCKETS.map((b) => b.value)).toEqual([
      "10000000", "1000000", "500000", "100000", "50000", NO_VALUE,
    ]);
  });
});

describe("sequenceIndex", () => {
  it("returns the pipeline position so sorting follows the workflow", () => {
    expect(sequenceIndex("missing_documents", STATUS_SEQUENCE)).toBe(0);
    expect(sequenceIndex("complete", STATUS_SEQUENCE)).toBe(4);
    expect(sequenceIndex("pending", VERDICT_SEQUENCE)).toBe(0);
  });

  it("returns null for blank or unknown values so they sort last", () => {
    expect(sequenceIndex("", STATUS_SEQUENCE)).toBeNull();
    expect(sequenceIndex(null, STATUS_SEQUENCE)).toBeNull();
    expect(sequenceIndex("something_new", STATUS_SEQUENCE)).toBeNull();
  });
});

describe("matchesDeadlineBuckets", () => {
  it("matches everything when nothing is selected", () => {
    expect(matchesDeadlineBuckets(-1, [])).toBe(true);
    expect(matchesDeadlineBuckets(null, [])).toBe(true);
  });

  it("treats any negative number of days left as overdue", () => {
    // -1 is the first day past the deadline: the boundary the Overdue option owns.
    expect(matchesDeadlineBuckets(-1, [DEADLINE_OVERDUE])).toBe(true);
    expect(matchesDeadlineBuckets(-30, [DEADLINE_OVERDUE])).toBe(true);
    expect(matchesDeadlineBuckets(0, [DEADLINE_OVERDUE])).toBe(false);
    expect(matchesDeadlineBuckets(3, [DEADLINE_OVERDUE])).toBe(false);
  });

  it("puts a deadline of exactly today under Due today, not Overdue", () => {
    expect(matchesDeadlineBuckets(0, ["0"])).toBe(true);
    expect(matchesDeadlineBuckets(-1, ["0"])).toBe(false);
    expect(matchesDeadlineBuckets(1, ["0"])).toBe(false);
  });

  it("counts a Within N days window inclusively", () => {
    // Exactly 2 is inside "Within 2 days"; 3 is the first day outside it.
    expect(matchesDeadlineBuckets(2, ["2"])).toBe(true);
    expect(matchesDeadlineBuckets(3, ["2"])).toBe(false);
    expect(matchesDeadlineBuckets(3, ["5"])).toBe(true);
    // Today counts as being within any forward-looking window.
    expect(matchesDeadlineBuckets(0, ["2"])).toBe(true);
  });

  it("keeps overdue cases out of the forward-looking windows", () => {
    // Arithmetically -1 <= 2, but "due in the next 2 days" must not quietly
    // absorb cases that are already late.
    expect(matchesDeadlineBuckets(-1, ["2"])).toBe(false);
    expect(matchesDeadlineBuckets(-1, ["10"])).toBe(false);
  });

  it("unions overlapping windows rather than intersecting them", () => {
    expect(matchesDeadlineBuckets(3, ["2"])).toBe(false);
    expect(matchesDeadlineBuckets(3, ["2", "5"])).toBe(true);
    expect(matchesDeadlineBuckets(-1, ["2", DEADLINE_OVERDUE])).toBe(true);
  });

  it("matches a missing deadline only via the No deadline option", () => {
    expect(matchesDeadlineBuckets(null, [NO_VALUE])).toBe(true);
    expect(matchesDeadlineBuckets(undefined, [NO_VALUE])).toBe(true);
    expect(matchesDeadlineBuckets(null, [DEADLINE_OVERDUE])).toBe(false);
    expect(matchesDeadlineBuckets(null, ["10"])).toBe(false);
    expect(matchesDeadlineBuckets(0, [NO_VALUE])).toBe(false);
  });

  it("offers the agreed windows plus a No deadline option", () => {
    expect(DEADLINE_BUCKETS.map((b) => b.value)).toEqual([
      DEADLINE_OVERDUE, "0", "2", "5", "10", NO_VALUE,
    ]);
  });
});
