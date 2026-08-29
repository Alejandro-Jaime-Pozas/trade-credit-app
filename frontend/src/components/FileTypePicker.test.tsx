/**
 * Tests for the grouped document picker (src/components/FileTypePicker.tsx).
 *
 * This exists because the catalog outgrew a single flat row of buttons. What has to hold:
 * the headings are on screen, the search narrows to what the user is looking for, and
 * "Select all" means exactly what is visible — never quietly reaching past the filter.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTypePicker } from "./FileTypePicker";
import type { FileType } from "@/lib/types";

function fileType(
  id: number,
  key: string,
  label_en: string,
  group: string,
  group_label: string,
  group_order: number,
  label_es = label_en,
): FileType {
  return {
    id,
    key,
    label_en,
    label_es,
    group,
    group_label,
    group_order,
    category: "other",
    is_active: true,
    is_global: true,
  } as unknown as FileType;
}

// Deliberately more than eight, which is where the search box appears.
const CATALOG = [
  fileType(1, "bank_statement", "Bank statement", "financial", "Financial", 0),
  fileType(2, "balance_sheet", "Balance sheet", "financial", "Financial", 0),
  fileType(3, "income_statement", "Income statement", "financial", "Financial", 0),
  fileType(4, "cashflow_statement", "Cashflow statement", "financial", "Financial", 0),
  fileType(5, "cfdi_facturas", "CFDI invoices", "tax", "Tax / SAT", 1),
  fileType(6, "cfdi_nomina", "Payroll CFDIs", "tax", "Tax / SAT", 1),
  fileType(7, "declaracion_anual", "Annual tax return", "tax", "Tax / SAT", 1),
  fileType(8, "acta_constitutiva", "Articles of incorporation", "legal", "Legal / corporate", 2, "Acta constitutiva"),
  fileType(9, "poder_notarial", "Power of attorney", "legal", "Legal / corporate", 2, "Poder notarial de apoderados"),
];

describe("FileTypePicker", () => {
  it("shows each document under its own heading, in the backend's order", () => {
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Financial", "Tax / SAT", "Legal / corporate"]);
  });

  it("reports the picked document's id", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<FileTypePicker fileTypes={CATALOG} onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Poder notarial de apoderados" }));

    expect(onPick).toHaveBeenCalledWith(9);
  });

  it("narrows the list as the user searches", async () => {
    const user = userEvent.setup();
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "cfdi");

    expect(screen.getByRole("button", { name: "CFDI invoices" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Payroll CFDIs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bank statement" })).not.toBeInTheDocument();
    // Headings follow the documents: an empty group is not worth a heading.
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Tax / SAT"]);
  });

  it("finds a document by its Spanish name", async () => {
    const user = userEvent.setup();
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "acta");

    expect(
      screen.getByRole("button", { name: "Acta constitutiva" }),
    ).toBeInTheDocument();
  });

  it("finds a document by its English name even though it prints the Spanish one", async () => {
    // The button reads "Poder notarial de apoderados", but someone who knows the
    // document as a power of attorney must still be able to search for it.
    const user = userEvent.setup();
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "power");

    expect(
      screen.getByRole("button", { name: "Poder notarial de apoderados" }),
    ).toBeInTheDocument();
  });

  it("prints the Spanish name and keeps the English one as a tooltip", () => {
    // The app's users are Mexican companies, so Spanish is what they read. The English
    // name stays reachable on hover rather than being thrown away.
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Acta constitutiva" });
    expect(button).toHaveAttribute("title", "Articles of incorporation");
  });

  it("falls back to the English name when a type has no Spanish one", () => {
    // A blank where a document name should be is worse than a name in the wrong
    // language, so the English one is used rather than nothing.
    const withoutSpanish = [
      { ...CATALOG[0], label_es: "" } as unknown as FileType,
    ];
    render(<FileTypePicker fileTypes={withoutSpanish} onPick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Bank statement" })).toBeInTheDocument();
  });

  it("says so when a search matches nothing", async () => {
    const user = userEvent.setup();
    render(<FileTypePicker fileTypes={CATALOG} onPick={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "zzzz");

    expect(screen.getByText("No documents match your search.")).toBeInTheDocument();
  });

  it("hides the search box for a list short enough to read at a glance", () => {
    render(<FileTypePicker fileTypes={CATALOG.slice(0, 3)} onPick={vi.fn()} />);

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("draws chosen documents as pressed", () => {
    render(<FileTypePicker fileTypes={CATALOG} selectedIds={[1]} onPick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Bank statement" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Balance sheet" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("claims no pressed state where a click is an action rather than a selection", () => {
    // The credit case page adds a document per click; "pressed" would be a lie there.
    render(<FileTypePicker fileTypes={CATALOG} prefix="+" onPick={vi.fn()} />);

    expect(screen.getByRole("button", { name: "+ Bank statement" })).not.toHaveAttribute(
      "aria-pressed",
    );
  });

  it("selects a whole group at once", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <FileTypePicker
        fileTypes={CATALOG}
        selectedIds={[]}
        showGroupActions
        onPick={onPick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select all Tax / SAT" }));

    expect(onPick.mock.calls.map(([id]) => id)).toEqual([5, 6, 7]);
  });

  it("clears a group that is already fully selected", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <FileTypePicker
        fileTypes={CATALOG}
        selectedIds={[5, 6, 7]}
        showGroupActions
        onPick={onPick}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear Tax / SAT" }));

    expect(onPick.mock.calls.map(([id]) => id)).toEqual([5, 6, 7]);
  });

  it("never reaches past the search when selecting a group", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <FileTypePicker
        fileTypes={CATALOG}
        selectedIds={[]}
        showGroupActions
        onPick={onPick}
      />,
    );

    await user.type(screen.getByRole("searchbox", { name: "Search documents" }), "invoices");
    await user.click(screen.getByRole("button", { name: "Select all Tax / SAT" }));

    // Only the visible match, not the whole Tax group.
    expect(onPick.mock.calls.map(([id]) => id)).toEqual([5]);
  });

  it("offers no group actions unless asked for them", () => {
    render(<FileTypePicker fileTypes={CATALOG} selectedIds={[]} onPick={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Select all/ })).not.toBeInTheDocument();
  });

  it("blocks every document while disabled", () => {
    render(<FileTypePicker fileTypes={CATALOG} disabled onPick={vi.fn()} />);

    const financial = screen.getAllByRole("heading")[0].closest("section");
    expect(within(financial as HTMLElement).getByRole("button", { name: "Bank statement" })).toBeDisabled();
  });
});
