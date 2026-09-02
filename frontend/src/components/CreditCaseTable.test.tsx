/**
 * Tests for the credit cases table component in isolation.
 *
 * `src/app/credit-cases/page.test.tsx` covers the same table wired into the dashboard
 * (loading, filtering and sorting real-looking rows). This file covers the two things
 * that are properties of the component itself rather than of the page:
 *
 * 1. The header row and the body row are driven by the same dynamic column list, so
 *    they can never drift out of order — the failure mode that made hand-written
 *    `<td>`s untenable once per-organization label columns appeared.
 * 2. The CSV export takes the rows the user is actually looking at, after their
 *    filters, rather than everything handed to the component.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { CreditCase, Customer, Label } from "@/lib/types";

// Only the download is mocked: `toCsv` stays real so the assertions below are made
// against the exact text a user would open in Excel, not a stand-in for it.
const downloadCsv = vi.fn();
vi.mock("@/lib/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csv")>("@/lib/csv");
  return {
    ...actual,
    downloadCsv: (...args: unknown[]) => downloadCsv(...args),
  };
});

const { CreditCaseTable, deadlineText } = await import("./CreditCaseTable");

const CUSTOMERS: Record<string, Customer> = {
  "http://api/customers/1/": { id: 1, name: "Acme Corp" } as Customer,
  "http://api/customers/2/": { id: 2, name: "Beta SA" } as Customer,
};

const LABELS: Label[] = [
  { url: "http://api/labels/7/", id: 7, name: "Sucursal", content_type: "creditcase" },
  { url: "http://api/labels/8/", id: 8, name: "Vendedor", content_type: "creditcase" },
] as unknown as Label[];

/** Two cases owned by different customers, so a filter can tell them apart. */
function makeCases(): CreditCase[] {
  return [
    {
      url: "http://api/credit-cases/1/",
      id: 1,
      status: "missing_documents",
      verdict: "pending",
      requested_amount: "2000000.00",
      currency: "MXN",
      requested_term_days: 30,
      created_at: "2026-08-01T09:00:00Z",
      updated_at: "2026-08-01T09:00:00Z",
      days_since_created: 4,
      days_until_verdict_due: 5,
      is_verdict_overdue: false,
      custom_fields: { Sucursal: "MTY Norte", Vendedor: "Paula" },
      customer: { url: "http://api/customers/1/", display: "Acme Corp" },
    },
    {
      url: "http://api/credit-cases/2/",
      id: 2,
      status: "complete",
      verdict: "approved",
      requested_amount: "100000.00",
      currency: "MXN",
      requested_term_days: 60,
      created_at: "2026-08-02T09:00:00Z",
      updated_at: "2026-08-02T09:00:00Z",
      days_since_created: 3,
      days_until_verdict_due: -3,
      is_verdict_overdue: true,
      custom_fields: { Sucursal: "CDMX Sur" },
      customer: { url: "http://api/customers/2/", display: "Beta SA" },
    },
  ] as unknown as CreditCase[];
}

function renderTable(overrides: Partial<React.ComponentProps<typeof CreditCaseTable>> = {}) {
  render(
    <CreditCaseTable
      cases={makeCases()}
      customersByUrl={CUSTOMERS}
      labels={LABELS}
      {...overrides}
    />,
  );
}

/** The visible heading text of each column, left to right. */
function headerLabels(): string[] {
  const header = screen.getAllByRole("row")[0];
  // The heading is the first span in the header cell; the rest are its buttons.
  return within(header)
    .getAllByRole("columnheader")
    .map((th) => th.querySelector("span")?.textContent?.trim() ?? "");
}

/** The text of every cell in one body row, left to right. */
function cellTexts(rowIndex: number): string[] {
  const row = screen.getAllByRole("row")[rowIndex];
  return within(row)
    .getAllByRole("cell")
    .map((td) => td.textContent?.trim() ?? "");
}

/** The last `downloadCsv` call, as `[filename, csv]`. */
function lastDownload(): [string, string] {
  expect(downloadCsv).toHaveBeenCalled();
  return downloadCsv.mock.calls.at(-1) as [string, string];
}

beforeEach(() => {
  downloadCsv.mockReset();
});

describe("dynamic columns", () => {
  it("appends one column per label, after the built-in ones", () => {
    renderTable();
    expect(headerLabels()).toEqual([
      "ID",
      "Customer",
      "Status",
      "Verdict",
      "Requested amount",
      "Requested term",
      "Created",
      "Days open",
      "Days left",
      "Sucursal",
      "Vendedor",
    ]);
  });

  it("keeps the body cells in lockstep with the header, label columns included", () => {
    renderTable();
    const headers = headerLabels();
    const cells = cellTexts(1);

    // Same count, or one of them has a cell with no heading over it.
    expect(cells).toHaveLength(headers.length);
    // Spot-check the values that would land under the wrong heading if the body
    // were still a fixed list of hand-written <td>s.
    expect(cells[headers.indexOf("Days open")]).toBe("4d");
    expect(cells[headers.indexOf("Days left")]).toBe("5 days left");
    expect(cells[headers.indexOf("Sucursal")]).toBe("MTY Norte");
    expect(cells[headers.indexOf("Vendedor")]).toBe("Paula");
  });

  it("shows — for a label the case has no value for", () => {
    renderTable();
    const headers = headerLabels();
    // The second case has a Sucursal but no Vendedor.
    expect(cellTexts(2)[headers.indexOf("Vendedor")]).toBe("—");
  });

  it("renders the built-in columns only when the org has no labels", () => {
    renderTable({ labels: [] });
    expect(headerLabels()).toEqual([
      "ID",
      "Customer",
      "Status",
      "Verdict",
      "Requested amount",
      "Requested term",
      "Created",
      "Days open",
      "Days left",
    ]);
  });

  it("spans the whole (dynamic) width with the empty-state row", () => {
    renderTable({ cases: [] });
    const cell = screen.getByText("No credit cases found.");
    expect(cell).toHaveAttribute("colspan", String(headerLabels().length));
  });

  it("marks an overdue case with the danger token", () => {
    renderTable();
    // Driven by is_verdict_overdue, not by the sign of the number, so a case the
    // backend considers on time never turns red.
    expect(screen.getByText("3 days late")).toHaveClass("text-danger");
    expect(screen.getByText("5 days left")).not.toHaveClass("text-danger");
  });

  it("uses the singular for a single day", () => {
    // "1 days left" is the kind of small wrongness a reader notices immediately.
    expect(deadlineText(1)).toBe("1 day left");
    expect(deadlineText(-1)).toBe("1 day late");
  });
});

describe("CSV export", () => {
  it("names the file after the list and today's date", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(lastDownload()[0]).toMatch(/^credit-cases-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("uses the same columns as the table, label columns included", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    const [, csv] = lastDownload();
    const headerLine = csv.split("\r\n")[0];
    // The BOM `toCsv` prepends for Excel isn't part of the first column's name.
    expect(headerLine.replace(/^﻿/, "").split(",")).toEqual(headerLabels());
  });

  it("exports the filtered rows, not everything handed to the table", async () => {
    const user = userEvent.setup();
    renderTable();

    // Narrow the table to Beta SA's single case...
    await user.click(screen.getByRole("button", { name: /^Filter by Customer/ }));
    const listbox = screen.getByRole("listbox", { name: "Customer filter values" });
    await user.click(within(listbox).getByRole("option", { name: /Beta SA/ }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    const [, csv] = lastDownload();
    const lines = csv.split("\r\n");

    // ...and the file is that one case: a header plus one row.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Beta SA");
    expect(lines[1]).toContain("CDMX Sur");
    expect(csv).not.toContain("Acme Corp");
    expect(csv).not.toContain("MTY Norte");
  });

  it("exports readable text where a column sorts by something internal", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    const [, csv] = lastDownload();
    // Status sorts by its pipeline position, so without a csvValue this row would
    // export as "0" rather than a name a person can read.
    expect(csv).toContain("Missing documents");
    // Days left exports the signed number so a spreadsheet can sort and total it.
    expect(csv).toContain(",-3,");
  });

  it("disables the button when a filter leaves nothing to export", async () => {
    const user = userEvent.setup();
    renderTable();

    const button = screen.getByRole("button", { name: "Export CSV" });
    expect(button).toBeEnabled();

    // "Within 2 days" excludes the overdue case and the one 5 days out.
    await user.click(screen.getByRole("button", { name: /^Filter by Days left/ }));
    const listbox = screen.getByRole("listbox", { name: "Days left filter values" });
    await user.click(within(listbox).getByRole("option", { name: /^Within 2 days/ }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("disables the button while the rows are still loading", () => {
    renderTable({ cases: null });
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });
});
