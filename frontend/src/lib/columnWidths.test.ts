/**
 * Tests for remembered column widths (src/lib/columnWidths.ts).
 *
 * The stored value comes from localStorage, which anything can write to and which
 * survives deploys — so the loader is the app's guard against a corrupted or outdated
 * entry rendering a permanently unusable table with no obvious way back.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clampColumnWidth,
  loadColumnWidths,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  saveColumnWidths,
} from "./columnWidths";

const TABLE = "creditCases";
const KEY = `tcapp.columnWidths.${TABLE}`;

beforeEach(() => {
  localStorage.clear();
});

describe("clampColumnWidth", () => {
  it("keeps a column usable at both extremes", () => {
    expect(clampColumnWidth(5)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(99999)).toBe(MAX_COLUMN_WIDTH);
    expect(clampColumnWidth(-40)).toBe(MIN_COLUMN_WIDTH);
  });

  it("rounds to whole pixels", () => {
    expect(clampColumnWidth(180.6)).toBe(181);
  });
});

describe("saveColumnWidths / loadColumnWidths", () => {
  it("round-trips what the user dragged", () => {
    saveColumnWidths(TABLE, { customer: 240, status: 120 });

    expect(loadColumnWidths(TABLE)).toEqual({ customer: 240, status: 120 });
  });

  it("returns nothing for a user who has never resized", () => {
    expect(loadColumnWidths(TABLE)).toEqual({});
  });

  it("keeps each table's widths separate", () => {
    saveColumnWidths(TABLE, { customer: 240 });

    expect(loadColumnWidths("somethingElse")).toEqual({});
  });

  it("ignores a corrupted entry instead of rendering a broken table", () => {
    localStorage.setItem(KEY, "not json at all");
    expect(loadColumnWidths(TABLE)).toEqual({});

    localStorage.setItem(KEY, JSON.stringify("a string"));
    expect(loadColumnWidths(TABLE)).toEqual({});
  });

  it("drops non-numeric widths but keeps the usable ones", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ customer: 240, status: "wide", verdict: null, amount: NaN }),
    );

    expect(loadColumnWidths(TABLE)).toEqual({ customer: 240 });
  });

  it("clamps stored values, so an old out-of-range entry can't hide a column", () => {
    localStorage.setItem(KEY, JSON.stringify({ customer: 4, status: 100000 }));

    expect(loadColumnWidths(TABLE)).toEqual({
      customer: MIN_COLUMN_WIDTH,
      status: MAX_COLUMN_WIDTH,
    });
  });
});
