/**
 * Tests for the money field (src/components/MoneyInput.tsx).
 *
 * Two things are pinned here. First, the shape change at the edges of editing — grouped
 * when idle, plain while focused — which is what lets the field be readable without any
 * caret arithmetic. Second, that `onChange` always reports the CANONICAL decimal string,
 * never the grouped text, because that value goes straight to the API and a stray comma
 * would be rejected (or worse, silently truncate the amount).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MoneyInput } from "./MoneyInput";

/** Mirrors how a page uses it: the parent owns the canonical value. */
function Harness({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MoneyInput
        aria-label="Requested amount"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
      {/* Exposes the canonical value the parent would send to the API. */}
      <output data-testid="canonical">{value}</output>
      {/* Stands in for the page's Discard changes button. */}
      <button type="button" onClick={() => setValue(initial)}>
        Discard
      </button>
    </>
  );
}

function field() {
  return screen.getByLabelText("Requested amount");
}

function canonical() {
  return screen.getByTestId("canonical").textContent;
}

describe("MoneyInput display", () => {
  it("shows a stored amount grouped when it isn't being edited", () => {
    render(<Harness initial="1500000.00" />);
    expect(field()).toHaveValue("1,500,000.00");
  });

  it("shows nothing for an empty amount, so the placeholder can show", () => {
    render(<Harness initial="" />);
    expect(field()).toHaveValue("");
  });

  it("drops the grouping on focus so typing behaves normally", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1500000.00" />);

    await user.click(field());

    expect(field()).toHaveValue("1500000.00");
  });

  it("groups again on blur", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1500000.00" />);

    await user.click(field());
    await user.tab();

    expect(field()).toHaveValue("1,500,000.00");
  });
});

describe("MoneyInput reports canonical values", () => {
  it("emits a plain decimal string, never the grouped text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(field());
    await user.keyboard("1500000");

    // A grouped string here would be rejected by the API, or truncated at the comma.
    expect(canonical()).toBe("1500000.00");
    for (const call of onChange.mock.calls) {
      expect(call[0]).not.toContain(",");
    }
  });

  it("pads to two decimals when editing ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("1500.5");
    await user.tab();

    expect(canonical()).toBe("1500.50");
    expect(field()).toHaveValue("1,500.50");
  });

  it("reports an empty string when the field is cleared", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1500.00" />);

    await user.clear(field());
    await user.tab();

    // The page sends "" as null rather than posting a broken decimal.
    expect(canonical()).toBe("");
    expect(field()).toHaveValue("");
  });
});

describe("MoneyInput typing rules", () => {
  it("lets a decimal point be typed without the value snapping shut", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("1500.");

    // Mid-typing state has to survive; normalising here would fight the user.
    expect(field()).toHaveValue("1500.");
  });

  it("refuses letters", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("12abc34");

    expect(field()).toHaveValue("1234");
  });

  it("refuses a third decimal place", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.keyboard("10.999");

    expect(field()).toHaveValue("10.99");
  });

  it("accepts a pasted, formatted amount", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(field());
    await user.paste("$1,500,000.00");
    await user.tab();

    expect(canonical()).toBe("1500000.00");
    expect(field()).toHaveValue("1,500,000.00");
  });

  it("ignores a keystroke that would add a third decimal", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1500.00" />);

    await user.click(field());
    // The caret lands at the end, where the two decimal places are already used.
    await user.keyboard("9");
    await user.tab();

    expect(field()).toHaveValue("1,500.00");
  });

  it("reflects a value the parent replaces, e.g. Discard changes", async () => {
    const user = userEvent.setup();
    render(<Harness initial="1500.00" />);

    await user.click(field());
    await user.clear(field());
    await user.keyboard("99");
    await user.tab();
    expect(field()).toHaveValue("99.00");

    // The parent putting the old value back must show through, since the field is no
    // longer being edited.
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(field()).toHaveValue("1,500.00");
  });
});
