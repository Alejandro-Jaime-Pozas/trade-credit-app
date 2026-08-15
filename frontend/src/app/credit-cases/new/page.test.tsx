/**
 * Tests for the customer search on the new credit case wizard
 * (`/credit-cases/new`, step 1).
 *
 * The behaviour pinned here is that focusing the field is enough to see the most
 * recently created customers — the user shouldn't have to guess at a name to discover
 * what already exists, and the common case right after creating a customer is starting
 * a case for that same customer.
 *
 * The keyboard contract is covered too, because the recent list shares the same
 * navigation code as the search results and it would be easy to break one with the other.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Customer } from "@/lib/types";

vi.mock("@/components/AppShell", () => ({
  AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { url: "http://api/users/1/", organizations: [{ url: "http://api/orgs/1/" }] },
    loading: false,
  }),
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

// Step 3 (document requirements) only runs after a case is created; stub its data
// loaders so nothing here reaches the network.
vi.mock("@/lib/fileTypes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fileTypes")>("@/lib/fileTypes");
  return {
    ...actual,
    listFileTypes: vi.fn(async () => []),
    getDefaultTemplate: vi.fn(async () => null),
  };
});

const { default: NewCreditCasePage } = await import("./page");

function makeCustomer(id: number, name: string, createdAt: string, rfc?: string): Customer {
  return {
    url: `http://api/customers/${id}/`,
    id,
    name,
    rfc: rfc ?? null,
    created_at: createdAt,
  } as unknown as Customer;
}

// Deliberately NOT in creation order, so a passing test proves the sort happens here
// rather than the API order leaking through.
const CUSTOMERS = [
  makeCustomer(1, "Ollivanders", "2026-01-01T09:00:00Z", "OLL010101AA1"),
  makeCustomer(4, "Three Broomsticks", "2026-04-01T09:00:00Z"),
  makeCustomer(2, "Gringotts", "2026-02-01T09:00:00Z"),
  makeCustomer(3, "Hogs Head", "2026-03-01T09:00:00Z"),
];

beforeEach(() => {
  drfListAll.mockReset();
  apiJson.mockReset();
  drfListAll.mockResolvedValue(CUSTOMERS);
});

function searchBox() {
  return screen.getByPlaceholderText("Search by name or RFC…");
}

function listbox() {
  return screen.getByRole("listbox");
}

/**
 * Option labels currently rendered in the dropdown.
 *
 * Name and RFC are separate spans separated by a CSS gap, so `textContent` runs them
 * together — collapse that back to a single space to compare against what a user reads.
 */
function optionNames(): string[] {
  return within(listbox())
    .getAllByRole("option")
    .map((el) => (el.textContent ?? "").replace(/\s*·\s*/g, " · ").trim());
}

async function renderPage() {
  render(<NewCreditCasePage />);
  // Wait for the customer list to land before interacting.
  await screen.findByRole("heading", { name: "New credit case" });
}

describe("customer search dropdown", () => {
  it("shows the most recently created customers on focus, newest first", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());

    expect(await screen.findByText("Recent customers")).toBeInTheDocument();
    expect(optionNames()).toEqual([
      "Three Broomsticks",
      "Hogs Head",
      "Gringotts",
      "Ollivanders · OLL010101AA1",
    ]);
  });

  it("offers no create row until the user has typed a name", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    // Nothing to create a customer *under* yet, so the row would be meaningless.
    expect(screen.queryByText(/Create .* as new customer/)).not.toBeInTheDocument();

    await user.type(searchBox(), "Leaky");
    expect(screen.getByText(/Create .* as new customer/)).toBeInTheDocument();
  });

  it("switches from the recent list to matches as the user types", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    expect(screen.getByText("Recent customers")).toBeInTheDocument();

    await user.type(searchBox(), "gringotts");

    expect(screen.queryByText("Recent customers")).not.toBeInTheDocument();
    expect(optionNames()).toEqual([
      "Gringotts",
      "+ Create “gringotts” as new customer",
    ]);
  });

  it("matches on RFC as well as name", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(searchBox(), "OLL0101");

    expect(optionNames()[0]).toContain("Ollivanders");
  });

  it("selects a recent customer with the keyboard alone", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    await screen.findByText("Recent customers");

    // First option is highlighted on open, so one ArrowDown lands on the second.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(await screen.findByText(/✓ Hogs Head/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects a recent customer by clicking it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    await screen.findByText("Recent customers");
    await user.click(within(listbox()).getByRole("option", { name: /Gringotts/ }));

    expect(await screen.findByText(/✓ Gringotts/)).toBeInTheDocument();
  });

  it("shows the recent list again after unlinking a chosen customer", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    await user.click(within(listbox()).getByRole("option", { name: /Gringotts/ }));
    await screen.findByText(/✓ Gringotts/);

    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(searchBox());

    expect(await screen.findByText("Recent customers")).toBeInTheDocument();
  });

  it("closes on Escape without selecting anything", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    await screen.findByText("Recent customers");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("tells a brand new organization there is nothing to pick yet", async () => {
    drfListAll.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());

    expect(
      await screen.findByText("No customers yet — type a name to create one."),
    ).toBeInTheDocument();
  });

  it("caps the recent list rather than dumping every customer", async () => {
    drfListAll.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) =>
        makeCustomer(i + 1, `Customer ${i + 1}`, `2026-01-${String(i + 1).padStart(2, "0")}T09:00:00Z`),
      ),
    );
    const user = userEvent.setup();
    await renderPage();

    await user.click(searchBox());
    await screen.findByText("Recent customers");

    expect(within(listbox()).getAllByRole("option")).toHaveLength(8);
  });
});
