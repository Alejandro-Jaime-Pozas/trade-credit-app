/**
 * Integration tests for the credit cases list page.
 *
 * `TableColumnHeader.test.tsx` covers the dropdown widget in isolation; this
 * file covers the wiring around it — the column definitions, what each
 * column's filter offers, how filters combine, and how the three-step sort
 * cycle reorders real rows.
 *
 * `@/lib/api` and the auth-dependent shell components are mocked so the page
 * can render without a backend or a logged-in session.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { CreditCase, Customer, Label } from "@/lib/types";

// AppShell/RequireAuth pull in the auth context and next/navigation; the page
// under test doesn't need either, so they render as pass-throughs.
vi.mock("@/components/AppShell", () => ({
  AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

const drfListAll = vi.fn();
const apiJson = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    drfListAll: (...args: unknown[]) => drfListAll(...args),
    apiJson: (...args: unknown[]) => apiJson(...args),
  };
});

const { default: CreditCasesPage } = await import("./page");

const CUSTOMERS: Record<string, Customer> = {
  "http://api/customers/1/": { id: 1, name: "Acme Corp" } as Customer,
  "http://api/customers/2/": { id: 2, name: "Beta SA" } as Customer,
};

// `customer` on a CreditCase is a hyperlink relation field ({"url": ..., "display": ...}),
// not a bare URL string -- see core/serializer_utils.py's NamedHyperlinkedRelatedField.
function customerRef(url: string): { url: string; display: string } {
  return { url, display: CUSTOMERS[url]?.name ?? url };
}

/** Days back from today, as an ISO string — keeps date tests independent of the clock. */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * The org's custom fields. One label -> one extra table column, so this is what
 * turns "Sucursal" below into a real column with its own filter.
 */
const LABELS: Label[] = [
  {
    url: "http://api/labels/7/",
    id: 7,
    name: "Sucursal",
    content_type: "creditcase",
  } as unknown as Label,
];

/**
 * Three cases chosen so every column can be told apart:
 * amounts 2,000,000 / 100,000 / none; terms 30 / 60 / none;
 * created today / 3 days ago / 45 days ago;
 * verdict deadlines 5 days out / 3 days late / due today;
 * and a Sucursal set on two of them and missing on the third.
 */
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
      created_at: daysAgoIso(0),
      updated_at: daysAgoIso(0),
      days_since_created: 0,
      days_until_verdict_due: 5,
      is_verdict_overdue: false,
      custom_fields: { Sucursal: "MTY Norte" },
      customer: customerRef("http://api/customers/1/"),
    } as unknown as CreditCase,
    {
      url: "http://api/credit-cases/2/",
      id: 2,
      status: "complete",
      verdict: "approved",
      requested_amount: "100000.00",
      currency: "MXN",
      requested_term_days: 60,
      created_at: daysAgoIso(3),
      updated_at: daysAgoIso(3),
      days_since_created: 3,
      days_until_verdict_due: -3,
      is_verdict_overdue: true,
      custom_fields: { Sucursal: "CDMX Sur" },
      customer: customerRef("http://api/customers/2/"),
    } as unknown as CreditCase,
    {
      url: "http://api/credit-cases/3/",
      id: 3,
      status: "pending_ai_verdict",
      verdict: "pending",
      requested_amount: null,
      currency: "MXN",
      requested_term_days: null,
      created_at: daysAgoIso(45),
      updated_at: daysAgoIso(45),
      days_since_created: 45,
      days_until_verdict_due: 0,
      is_verdict_overdue: false,
      // No Sucursal recorded — this row is what the "—" filter option must find.
      custom_fields: {},
      customer: customerRef("http://api/customers/1/"),
    } as unknown as CreditCase,
  ];
}

beforeEach(() => {
  drfListAll.mockReset();
  apiJson.mockReset();
  // The page now loads two lists through `drfListAll`, so the mock answers by path
  // rather than returning the same rows to whoever asks.
  drfListAll.mockImplementation(async ({ path }: { path: string }) =>
    path === "/labels/" ? LABELS : makeCases(),
  );
  apiJson.mockImplementation(async ({ pathOrUrl }: { pathOrUrl: string }) =>
    CUSTOMERS[pathOrUrl],
  );
});

/** The `#id` link text of each rendered row, in display order. */
async function rowIds(): Promise<string[]> {
  const rows = await screen.findAllByRole("row");
  return rows
    .slice(1) // drop the header row
    .map((r) => within(r).queryByRole("link", { name: /^#\d+$/ })?.textContent ?? "")
    .filter(Boolean);
}

async function renderPage() {
  render(<CreditCasesPage />);
  // Wait for both the cases and the customer names to resolve. Acme owns two
  // of the three cases, hence findAll rather than find.
  await screen.findAllByRole("link", { name: "Acme Corp" });
}

/** The visible heading text of each column, left to right. */
async function headerLabels(): Promise<string[]> {
  const header = (await screen.findAllByRole("row"))[0];
  // The heading text is the first child of the header cell's flex row; the rest
  // are the sort and filter buttons.
  return within(header)
    .getAllByRole("columnheader")
    .map((th) => th.querySelector("span")?.textContent?.trim() ?? "");
}

/** Position of a column by its heading, for reading the matching body cell. */
async function columnIndex(label: string): Promise<number> {
  const index = (await headerLabels()).indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

/** The text of one column's cell in each rendered row, in display order. */
async function columnCells(label: string): Promise<string[]> {
  const index = await columnIndex(label);
  const rows = await screen.findAllByRole("row");
  return rows
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[index]?.textContent?.trim() ?? "");
}

async function openFilter(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(`^Filter by ${label}`) }));
  return screen.getByRole("listbox", { name: `${label} filter values` });
}

describe("credit cases table columns", () => {
  it("gives every column a sort button, and every column except ID a filter button", async () => {
    await renderPage();
    for (const label of [
      "ID",
      "Customer",
      "Status",
      "Verdict",
      "Requested amount",
      "Requested term",
      "Created",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^Sort by ${label} ascending$`) }),
      ).toBeInTheDocument();
    }
    for (const label of [
      "Customer",
      "Status",
      "Verdict",
      "Requested amount",
      "Requested term",
      "Created",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^Filter by ${label}`) }),
      ).toBeInTheDocument();
    }
    // ID sorts but has no filter — an option per distinct id would be one
    // option per row.
    expect(screen.queryByRole("button", { name: /Filter by ID/ })).not.toBeInTheDocument();
  });

  it("sorts by ID through the same three-click cycle", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Default order is updated_at desc, which happens to be #1, #2, #3.
    const sortId = screen.getByRole("button", { name: "Sort by ID ascending" });
    await user.click(sortId);
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);

    await user.click(screen.getByRole("button", { name: /ID: sorted ascending/ }));
    expect(await rowIds()).toEqual(["#3", "#2", "#1"]);

    await user.click(screen.getByRole("button", { name: /ID: sorted descending/ }));
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
    expect(screen.getByRole("button", { name: "Sort by ID ascending" })).toBeInTheDocument();
  });

  it("links the customer name to that row's credit case, not the customer", async () => {
    await renderPage();
    const row = (await screen.findAllByRole("row"))[1];
    // Both the id and the customer name open the same credit case; the
    // customer name is just a friendlier label for the row.
    expect(within(row).getByRole("link", { name: "#1" })).toHaveAttribute(
      "href",
      "/credit-cases/1",
    );
    expect(within(row).getByRole("link", { name: "Acme Corp" })).toHaveAttribute(
      "href",
      "/credit-cases/1",
    );
  });

  it("shows amount and term in separate columns", async () => {
    await renderPage();
    const row = (await screen.findAllByRole("row"))[1];
    expect(within(row).getByText(/2,000,000\.00/)).toBeInTheDocument();
    expect(within(row).getByText("30d")).toBeInTheDocument();
  });

  it("keeps the created timestamp on a single line", async () => {
    await renderPage();
    const rows = await screen.findAllByRole("row");
    // Found by its position in the header rather than as "the last cell": the
    // column list is dynamic now (deadline and label columns follow Created), so
    // a fixed index would be testing the wrong cell as soon as one is added.
    const created = await columnIndex("Created");
    // Without nowrap the time wrapped its "PM" onto a second row, making the
    // column two lines tall (docs/bug_fixes/2).
    expect(within(rows[1]).getAllByRole("cell")[created]).toHaveClass(
      "whitespace-nowrap",
    );
  });
});

describe("sorting", () => {
  it("cycles a column ascending, descending, then back to the default order", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Default order is updated_at desc: newest (#1) first.
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);

    const sortAmount = screen.getByRole("button", { name: /^Sort by Requested amount/ });
    await user.click(sortAmount);
    // Ascending by amount; the null-amount row sinks to the bottom.
    expect(await rowIds()).toEqual(["#2", "#1", "#3"]);

    await user.click(screen.getByRole("button", { name: /Requested amount: sorted ascending/ }));
    // Descending — but the null row still stays last.
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);

    await user.click(screen.getByRole("button", { name: /Requested amount: sorted descending/ }));
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
    expect(
      screen.getByRole("button", { name: "Sort by Requested amount ascending" }),
    ).toBeInTheDocument();
  });

  it("sorts status by pipeline order rather than alphabetically", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /^Sort by Status/ }));
    // missing_documents -> pending_ai_verdict -> complete.
    // Alphabetically this would have been complete, missing, pending.
    expect(await rowIds()).toEqual(["#1", "#3", "#2"]);
  });

  it("abandons the previous column when another column is sorted", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /^Sort by Status/ }));
    await user.click(screen.getByRole("button", { name: /^Sort by Customer/ }));

    expect(screen.getByRole("button", { name: "Sort by Status ascending" })).toBeInTheDocument();
    // Acme's two cases first, then Beta.
    expect(await rowIds()).toEqual(["#1", "#3", "#2"]);
  });
});

describe("filtering", () => {
  it("filters by a customer and reflects it in a removable chip", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Customer");
    await user.click(within(listbox).getByRole("option", { name: /Beta SA/ }));

    expect(await rowIds()).toEqual(["#2"]);

    await user.keyboard("{Escape}");
    const chip = screen.getByRole("button", { name: "Remove Customer filter Beta SA" });
    await user.click(chip);
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
  });

  it("offers threshold buckets on amount, including a No amount option", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Requested amount");
    // An option row renders three spans — tick, label, match count — so read
    // the middle one rather than trying to strip the count off textContent
    // (these labels end in digits themselves).
    const labels = within(listbox)
      .getAllByRole("option")
      .map((el) => el.children[1]?.textContent?.trim() ?? "");
    expect(labels).toEqual([
      "> 10,000,000",
      "> 1,000,000",
      "> 500,000",
      "> 100,000",
      "> 50,000",
      "No amount",
    ]);

    await user.click(within(listbox).getByRole("option", { name: /> 1,000,000/ }));
    expect(await rowIds()).toEqual(["#1"]);

    // Unioning a lower bucket widens the result rather than narrowing it.
    await user.click(within(listbox).getByRole("option", { name: /> 50,000/ }));
    expect(await rowIds()).toEqual(["#1", "#2"]);

    await user.click(within(listbox).getByRole("option", { name: /No amount/ }));
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
  });

  it("offers relative-day presets on created", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Created");
    await user.click(within(listbox).getByRole("option", { name: /^Today/ }));
    expect(await rowIds()).toEqual(["#1"]);

    await user.click(within(listbox).getByRole("option", { name: /^Last 7 days/ }));
    expect(await rowIds()).toEqual(["#1", "#2"]);

    await user.click(within(listbox).getByRole("option", { name: /^Last 60 days/ }));
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
  });

  it("ANDs filters across columns", async () => {
    const user = userEvent.setup();
    await renderPage();

    const customers = await openFilter(user, "Customer");
    await user.click(within(customers).getByRole("option", { name: /Acme Corp/ }));
    await user.keyboard("{Escape}");
    expect(await rowIds()).toEqual(["#1", "#3"]);

    const created = await openFilter(user, "Created");
    await user.click(within(created).getByRole("option", { name: /^Today/ }));
    // Acme AND created today leaves only #1.
    expect(await rowIds()).toEqual(["#1"]);
  });

  it("counts options against the other columns' active filters", async () => {
    const user = userEvent.setup();
    await renderPage();

    const customers = await openFilter(user, "Customer");
    await user.click(within(customers).getByRole("option", { name: /Beta SA/ }));
    await user.keyboard("{Escape}");

    // With only Beta's single case in play, the status options must reflect
    // that rather than counting all three cases.
    const statuses = await openFilter(user, "Status");
    const options = within(statuses).getAllByRole("option");
    expect(options).toHaveLength(1);
    // Shown by its readable label, not the raw `complete` key.
    expect(options[0]).toHaveTextContent("Complete");
  });

  it("clears every column with Clear all filters", async () => {
    const user = userEvent.setup();
    await renderPage();

    const customers = await openFilter(user, "Customer");
    await user.click(within(customers).getByRole("option", { name: /Beta SA/ }));
    await user.keyboard("{Escape}");

    const verdicts = await openFilter(user, "Verdict");
    await user.click(within(verdicts).getByRole("option", { name: /approved/ }));
    await user.keyboard("{Escape}");

    expect(screen.getAllByRole("button", { name: /^Remove .* filter/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(screen.queryByRole("button", { name: /^Remove .* filter/ })).not.toBeInTheDocument();
    expect(await rowIds()).toEqual(["#1", "#2", "#3"]);
  });

  it("distinguishes an empty table from an over-filtered one", async () => {
    const user = userEvent.setup();
    await renderPage();

    const customers = await openFilter(user, "Customer");
    await user.click(within(customers).getByRole("option", { name: /Beta SA/ }));
    await user.keyboard("{Escape}");

    const created = await openFilter(user, "Created");
    await user.click(within(created).getByRole("option", { name: /^Today/ }));

    expect(
      screen.getByText("No credit cases match the current filters."),
    ).toBeInTheDocument();
  });

  it("says there are no credit cases when the org has none", async () => {
    drfListAll.mockImplementation(async () => []);
    render(<CreditCasesPage />);
    expect(await screen.findByText("No credit cases found.")).toBeInTheDocument();
  });
});

describe("label columns", () => {
  it("adds a column per custom field the org has defined", async () => {
    await renderPage();
    // Appended after the built-in columns, with its own sort and filter controls.
    expect(await headerLabels()).toEqual([
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
    ]);
    expect(
      screen.getByRole("button", { name: "Sort by Sucursal ascending" }),
    ).toBeInTheDocument();
  });

  it("shows each case's value from custom_fields, and — when it has none", async () => {
    await renderPage();
    expect(await columnCells("Sucursal")).toEqual(["MTY Norte", "CDMX Sur", "—"]);
  });

  it("filters the rows down to one label value", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Sucursal");
    await user.click(within(listbox).getByRole("option", { name: /MTY Norte/ }));
    expect(await rowIds()).toEqual(["#1"]);
  });

  it("files a case with no value for the label under the — option", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Sucursal");
    // Same missing-value bucket every other column uses, so it reads as "—" and
    // sits at the bottom of the option list.
    const options = within(listbox).getAllByRole("option");
    expect(options.at(-1)).toHaveTextContent("—");
    await user.click(options.at(-1)!);
    expect(await rowIds()).toEqual(["#3"]);
  });
});

describe("verdict deadline columns", () => {
  it("shows how long each case has been open", async () => {
    await renderPage();
    expect(await columnCells("Days open")).toEqual(["0d", "3d", "45d"]);
  });

  it("spells out days left as late / today / left rather than a signed number", async () => {
    await renderPage();
    // -3 must not reach the user as "-3"; a reader shouldn't have to decode a sign.
    expect(await columnCells("Days left")).toEqual([
      "5 days left",
      "3 days late",
      "Today",
    ]);
  });

  it("sorts days left by the underlying number, most overdue first", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: /^Sort by Days left/ }));
    // -3 (#2) then 0 (#3) then 5 (#1) — the wording must not sort alphabetically.
    expect(await rowIds()).toEqual(["#2", "#3", "#1"]);
  });

  it("filters by the deadline windows, unioning the selected ones", async () => {
    const user = userEvent.setup();
    await renderPage();

    const listbox = await openFilter(user, "Days left");
    await user.click(within(listbox).getByRole("option", { name: /^Overdue/ }));
    expect(await rowIds()).toEqual(["#2"]);

    await user.click(within(listbox).getByRole("option", { name: /^Due today/ }));
    expect(await rowIds()).toEqual(["#2", "#3"]);
  });

  it("sorts Days open but offers no filter for it", async () => {
    await renderPage();
    expect(
      screen.getByRole("button", { name: "Sort by Days open ascending" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Filter by Days open/ }),
    ).not.toBeInTheDocument();
  });
});
