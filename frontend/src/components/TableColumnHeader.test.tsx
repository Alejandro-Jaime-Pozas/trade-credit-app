/**
 * Tests for the credit cases table's per-column sort + filter header
 * (src/components/TableColumnHeader.tsx).
 *
 * The headline requirement this file guards is the one that is easiest to
 * regress: searching inside the filter dropdown must never disturb values the
 * user already selected. A user has to be able to search, tick a value, clear
 * the search, search again, tick another, and still have both selected.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TableColumnHeader } from "./TableColumnHeader";
import { toggleValue, type FilterOption } from "@/lib/tableControls";

const OPTIONS: FilterOption[] = [
  { value: "Acme Corp", label: "Acme Corp", count: 3 },
  { value: "Beta SA", label: "Beta SA", count: 2 },
  { value: "Gamma Holdings", label: "Gamma Holdings", count: 1 },
];

/**
 * Renders the header the way the page does: selection state lives in the
 * PARENT, not in the dropdown. Testing against a stateless component would
 * miss the whole point, since the bug being guarded against is selections
 * being lost when the dropdown re-renders.
 */
function Harness({
  onToggleSort = () => {},
  options = OPTIONS,
}: {
  onToggleSort?: () => void;
  options?: FilterOption[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <table>
      <thead>
        <tr>
          <TableColumnHeader
            columnId="customer"
            label="Customer"
            sortDirection={null}
            onToggleSort={onToggleSort}
            options={options}
            selected={selected}
            onToggleValue={(value) => setSelected((prev) => toggleValue(prev, value))}
            onClearColumn={() => setSelected([])}
          />
        </tr>
      </thead>
    </table>
  );
}

function getListbox() {
  return screen.getByRole("listbox", { name: "Customer filter values" });
}

/**
 * An option row renders three spans — tick, label, match count — so read the
 * middle one. (Stripping the count off `textContent` with a regex would also
 * eat labels that legitimately end in digits, e.g. "> 1,000,000".)
 */
function optionText(el: Element): string {
  return el.children[1]?.textContent?.trim() ?? "";
}

/** Labels of the options currently rendered in the dropdown. */
function visibleOptionLabels(): string[] {
  return within(getListbox()).getAllByRole("option").map(optionText);
}

/** Option values the dropdown currently reports as selected. */
function selectedOptionLabels(): string[] {
  return within(getListbox())
    .getAllByRole("option")
    .filter((el) => el.getAttribute("aria-selected") === "true")
    .map(optionText);
}

describe("TableColumnHeader sort button", () => {
  it("shows the neutral glyph and asks for ascending when unsorted", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Sort by Customer ascending" }),
    ).toHaveTextContent("⇅");
  });

  it("calls back on every click so the parent can advance the cycle", async () => {
    const user = userEvent.setup();
    const onToggleSort = vi.fn();
    render(<Harness onToggleSort={onToggleSort} />);

    const button = screen.getByRole("button", { name: /Sort by Customer/ });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(onToggleSort).toHaveBeenCalledTimes(3);
  });

  it("renders sort-only when no options are supplied", () => {
    const noop = () => {};
    render(
      <table>
        <thead>
          <tr>
            <TableColumnHeader
              columnId="id"
              label="ID"
              sortDirection={null}
              onToggleSort={noop}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("button", { name: "Sort by ID ascending" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Filter by ID/ })).not.toBeInTheDocument();
  });

  it("reflects the direction the parent hands back", () => {
    const noop = () => {};
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <TableColumnHeader
              columnId="customer"
              label="Customer"
              sortDirection="asc"
              onToggleSort={noop}
              options={OPTIONS}
              selected={[]}
              onToggleValue={noop}
              onClearColumn={noop}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("button", { name: /Sort descending/ })).toHaveTextContent("▲");

    rerender(
      <table>
        <thead>
          <tr>
            <TableColumnHeader
              columnId="customer"
              label="Customer"
              sortDirection="desc"
              onToggleSort={noop}
              options={OPTIONS}
              selected={[]}
              onToggleValue={noop}
              onClearColumn={noop}
            />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("button", { name: /Clear sort/ })).toHaveTextContent("▼");
  });
});

describe("TableColumnHeader filter dropdown", () => {
  it("opens with every option and narrows as the user searches", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    expect(visibleOptionLabels()).toEqual(["Acme Corp", "Beta SA", "Gamma Holdings"]);

    await user.type(screen.getByRole("combobox"), "bet");
    expect(visibleOptionLabels()).toEqual(["Beta SA"]);
  });

  it("keeps selections when the search is cleared, and allows adding more", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    const search = screen.getByRole("combobox");

    // Search for the first value and select it.
    await user.type(search, "acme");
    await user.click(within(getListbox()).getByRole("option", { name: /Acme Corp/ }));
    expect(selectedOptionLabels()).toEqual(["Acme Corp"]);

    // Clear the search — the selection must survive.
    await user.clear(search);
    expect(visibleOptionLabels()).toEqual(["Acme Corp", "Beta SA", "Gamma Holdings"]);
    expect(selectedOptionLabels()).toEqual(["Acme Corp"]);

    // Search again and select a second value; the first is not wiped.
    await user.type(search, "gamma");
    await user.click(within(getListbox()).getByRole("option", { name: /Gamma Holdings/ }));
    expect(selectedOptionLabels()).toEqual(
      expect.arrayContaining(["Acme Corp", "Gamma Holdings"]),
    );

    await user.clear(search);
    expect(selectedOptionLabels()).toEqual(["Acme Corp", "Gamma Holdings"]);
    expect(
      screen.getByRole("button", { name: "Filter by Customer (2 selected)" }),
    ).toBeInTheDocument();
  });

  it("pins an already-selected option that the current search would hide", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    const search = screen.getByRole("combobox");

    await user.type(search, "acme");
    await user.click(within(getListbox()).getByRole("option", { name: /Acme Corp/ }));

    // "Acme Corp" doesn't match "gamma", but it stays visible under "Selected"
    // so the user can see it is still active while picking their next value.
    await user.clear(search);
    await user.type(search, "gamma");
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(visibleOptionLabels()).toEqual(["Acme Corp", "Gamma Holdings"]);
    expect(selectedOptionLabels()).toEqual(["Acme Corp"]);
  });

  it("toggles a value off when it is clicked again", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    const option = within(getListbox()).getByRole("option", { name: /Beta SA/ });
    await user.click(option);
    expect(selectedOptionLabels()).toEqual(["Beta SA"]);

    await user.click(within(getListbox()).getByRole("option", { name: /Beta SA/ }));
    expect(selectedOptionLabels()).toEqual([]);
  });

  it("clears only this column via the Clear action", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    await user.click(within(getListbox()).getByRole("option", { name: /Acme Corp/ }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(selectedOptionLabels()).toEqual([]);
  });

  it("supports selecting with the keyboard alone", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    // The search input is focused on open, so arrows move the highlight
    // without the user ever leaving the box.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(selectedOptionLabels()).toEqual(["Beta SA"]);

    await user.keyboard("{ArrowUp}{Enter}");
    expect(selectedOptionLabels()).toEqual(expect.arrayContaining(["Acme Corp", "Beta SA"]));
  });

  it("closes on Escape and returns focus to the filter button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const filterButton = screen.getByRole("button", { name: "Filter by Customer" });
    await user.click(filterButton);
    expect(getListbox()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(filterButton).toHaveFocus();
  });

  it("renders the panel outside the table so a scroll container cannot clip it", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));

    // Regression guard for docs/bug_fixes/2: as an absolutely-positioned child
    // of the header cell, the panel was clipped by the table's
    // `overflow-x-auto` wrapper and cut off on the left. It must be portalled
    // out of the table entirely.
    const listbox = getListbox();
    expect(document.querySelector("table")?.contains(listbox)).toBe(false);
    expect(listbox.closest("[style*='position: fixed']")).not.toBeNull();
  });

  it("closes when the user clicks outside it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <button type="button">Somewhere else</button>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    expect(getListbox()).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Somewhere else" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("tells the user when a search matches nothing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Filter by Customer" }));
    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(screen.getByText("No matching values.")).toBeInTheDocument();
  });
});
