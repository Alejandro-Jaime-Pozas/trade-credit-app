// @vitest-environment node
/**
 * Tests for the CSV export helpers (src/lib/csv.ts).
 *
 * This file overrides the suite's default jsdom environment with Node (the
 * `@vitest-environment node` comment above must be the very first line).
 * `toCsv` and `csvFilename` are plain string logic and don't care either
 * way, but running under Node — where there's no `document` at all — is the
 * cleanest way to exercise `downloadCsv`'s "no DOM available" guard without
 * having to fake deleting `document` out of jsdom.
 */
import { describe, expect, it } from "vitest";
import { csvFilename, downloadCsv, toCsv, type CsvColumn } from "./csv";

type Row = { name: string; amount: number | null };

const columns: CsvColumn<Row>[] = [
  { header: "Name", value: (row) => row.name },
  { header: "Amount", value: (row) => row.amount },
];

describe("toCsv", () => {
  it("renders just the header row for an empty rows array", () => {
    expect(toCsv([], columns)).toBe("﻿Name,Amount");
  });

  it("renders header and data rows joined with CRLF", () => {
    const rows: Row[] = [{ name: "Acme", amount: 100 }];
    expect(toCsv(rows, columns)).toBe("﻿Name,Amount\r\nAcme,100");
  });

  it("quotes a field containing a comma", () => {
    const rows: Row[] = [{ name: "Acme, Inc", amount: 1 }];
    expect(toCsv(rows, columns)).toBe('﻿Name,Amount\r\n"Acme, Inc",1');
  });

  it("quotes and doubles an embedded double quote", () => {
    const rows: Row[] = [{ name: 'The "Big" Co', amount: 1 }];
    expect(toCsv(rows, columns)).toBe('﻿Name,Amount\r\n"The ""Big"" Co",1');
  });

  it("quotes a field containing a newline", () => {
    const rows: Row[] = [{ name: "Line1\nLine2", amount: 1 }];
    expect(toCsv(rows, columns)).toBe('﻿Name,Amount\r\n"Line1\nLine2",1');
  });

  it("quotes a field with leading or trailing whitespace", () => {
    const rows: Row[] = [{ name: " Acme", amount: 1 }];
    expect(toCsv(rows, columns)).toBe('﻿Name,Amount\r\n" Acme",1');

    const trailing: Row[] = [{ name: "Acme ", amount: 1 }];
    expect(toCsv(trailing, columns)).toBe('﻿Name,Amount\r\n"Acme ",1');
  });

  it("renders null and undefined values as empty fields", () => {
    const rows: Row[] = [{ name: "Acme", amount: null }];
    expect(toCsv(rows, columns)).toBe("﻿Name,Amount\r\nAcme,");

    const withUndefined: CsvColumn<Row>[] = [
      { header: "Name", value: () => undefined },
    ];
    expect(toCsv([{ name: "x", amount: 1 }], withUndefined)).toBe("﻿Name\r\n");
  });

  it("renders number values without quotes", () => {
    const rows: Row[] = [{ name: "Acme", amount: 1500000 }];
    expect(toCsv(rows, columns)).toBe("﻿Name,Amount\r\nAcme,1500000");
  });

  it.each([
    ["=SUM(A1:A2)", "'=SUM(A1:A2)"],
    ["+1+1", "'+1+1"],
    ["-1+1", "'-1+1"],
    ["@SUM(A1)", "'@SUM(A1)"],
  ])("neutralises formula-injection prefix %s", (input, expected) => {
    const rows: Row[] = [{ name: input, amount: 1 }];
    expect(toCsv(rows, columns)).toBe(`﻿Name,Amount\r\n${expected},1`);
  });

  it("leaves a negative NUMBER alone, despite its leading minus sign", () => {
    // The formula guard is for user-typed text. A number came from our own code, and
    // quoting it would hand Excel the text "-3" instead of a value it can sort or total.
    const rows: Row[] = [{ name: "Acme", amount: -3 }];
    expect(toCsv(rows, columns)).toBe("\ufeffName,Amount\r\nAcme,-3");
  });

  it("prepends exactly one UTF-8 BOM, at the very start of the string", () => {
    const csv = toCsv([{ name: "Acme", amount: 1 }], columns);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.indexOf("﻿")).toBe(0);
    expect(csv.split("﻿")).toHaveLength(2); // exactly one occurrence
  });
});

describe("csvFilename", () => {
  it("formats a fixed date using local date parts", () => {
    const fixed = new Date(2026, 7, 31); // 2026-08-31 local time
    expect(csvFilename("credit-cases", fixed)).toBe("credit-cases-2026-08-31.csv");
  });

  it("zero-pads single-digit months and days", () => {
    const fixed = new Date(2026, 0, 5); // 2026-01-05 local time
    expect(csvFilename("export", fixed)).toBe("export-2026-01-05.csv");
  });
});

describe("downloadCsv", () => {
  it("is a no-op when there is no document (e.g. this Node test environment)", () => {
    expect(typeof document).toBe("undefined");
    expect(() => downloadCsv("file.csv", "a,b")).not.toThrow();
  });
});
