/**
 * Tests for the custom field value box (`src/components/ValueCombobox.tsx`).
 *
 * The bug this replaces: values were offered through a native `<datalist>`, which shows
 * nothing until you start typing. Someone whose organization already records "MTY Norte"
 * had no way to see that from the box, so they retyped it — sometimes as "MTY norte" —
 * and the dashboard then filtered the two as unrelated values.
 *
 * So the tests are about DISCOVERY as much as selection: the values have to be reachable
 * without typing anything first.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ValueCombobox } from "./ValueCombobox";

const OPTIONS = ["MTY Norte", "GDL", "CDMX"];

/** Renders with state, since the component is controlled by its parent. */
function Harness(props: { options?: string[]; initial?: string }) {
  const [value, setValue] = React.useState(props.initial ?? "");
  return (
    <ValueCombobox
      id="sucursal"
      value={value}
      onChange={setValue}
      options={props.options ?? OPTIONS}
      ariaLabel="sucursal"
    />
  );
}

describe("discovering existing values", () => {
  it("lists every value without the user typing anything", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show existing values" }));

    const listbox = screen.getByRole("listbox", { name: "Existing values" });
    expect(listbox).toBeInTheDocument();
    for (const option of OPTIONS) {
      expect(screen.getByRole("option", { name: option })).toBeInTheDocument();
    }
  });

  it("shows no caret when nothing has been recorded yet", () => {
    render(<Harness options={[]} />);

    // A caret promising an empty list is worse than no caret — there is nothing to
    // browse. Typing still offers to create, which the next test covers.
    expect(
      screen.queryByRole("button", { name: "Show existing values" }),
    ).toBeNull();
    expect(screen.getByRole("combobox", { name: "sucursal" })).toBeInTheDocument();
  });

  it("opens on ArrowDown from the input", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "sucursal" }));
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("listbox", { name: "Existing values" })).toBeInTheDocument();
  });
});

describe("choosing a value", () => {
  it("fills the box from the list", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show existing values" }));
    await user.click(screen.getByRole("option", { name: "MTY Norte" }));

    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("MTY Norte");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("narrows the list as the user types", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "mty");

    expect(screen.getByRole("option", { name: "MTY Norte" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "GDL" })).toBeNull();
  });

  it("offers to create when the text matches nothing", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");

    // This row is the whole fix. The list of existing values used to be all there was,
    // so it read as the only permitted answers and users went hunting for a page to
    // define a new one on — which does not exist. Values are created by using them.
    expect(
      screen.getByRole("option", { name: /Create .*Puebla/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "MTY Norte" })).toBeNull();
  });

  it("keeps a typed value that is not in the list", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ValueCombobox
        value=""
        onChange={onChange}
        options={OPTIONS}
        ariaLabel="sucursal"
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "P");

    expect(onChange).toHaveBeenCalledWith("P");
  });

  it("picks the highlighted option with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "sucursal" }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    // Opened on the first option, then moved one down.
    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("GDL");
  });

  it("closes on Escape without changing the value", async () => {
    const user = userEvent.setup();
    render(<Harness initial="CDMX" />);

    await user.click(screen.getByRole("button", { name: "Show existing values" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("CDMX");
  });
});

describe("where the panel lives", () => {
  it("renders outside the field so a scrolling ancestor cannot clip it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Show existing values" }));

    const listbox = screen.getByRole("listbox", { name: "Existing values" });
    expect(container.contains(listbox)).toBe(false);
  });
});


describe("creating a value", () => {
  it("offers to create alongside partial matches", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "MTY");

    // "MTY Sur" is a plausible new value even while "MTY Norte" is matching.
    expect(screen.getByRole("option", { name: "MTY Norte" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Create .*MTY/ })).toBeInTheDocument();
  });

  it("does not offer to create a value that already exists", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "GDL");

    // Offering it would invite the duplicate this control exists to prevent.
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("ignores case when deciding whether a value is new", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "mty norte");

    // "mty norte" is the value that exists, not a second one beside it — which is
    // exactly the mistake that produced two spellings on the dashboard before.
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
  });

  it("keeps the typed value when the create row is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");
    await user.click(screen.getByRole("option", { name: /Create .*Puebla/ }));

    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("Puebla");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("reaches the create row with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "MTY");
    // Existing match first, create row second.
    await user.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("MTY");
  });

  it("says where a new value ends up", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");

    // Without this, "Create" reads as a promise something was written, and the user
    // leaves the page having lost it — custom fields save with the rest of Details.
    expect(screen.getByText(/when you save the case/i)).toBeInTheDocument();
  });

  it("offers to create on a field that has no values at all", async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} />);

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");

    // The field a user is most likely to be confused by is the empty one.
    expect(
      screen.getByRole("option", { name: /Create .*Puebla/ }),
    ).toBeInTheDocument();
  });
});
