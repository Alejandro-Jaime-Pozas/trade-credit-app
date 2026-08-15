/**
 * Tests for the credit case status indicator (src/components/StatusDot.tsx).
 *
 * Colour is the whole point of the dot, but colour alone excludes anyone who can't
 * distinguish it — so the accessible name is asserted alongside the colour class on
 * every status.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusDot, StatusWithDot } from "./StatusDot";

describe("StatusDot", () => {
  it.each([
    ["complete", "Complete", "bg-green-500"],
    ["missing_documents", "Missing documents", "bg-orange-500"],
    ["buro_de_credito_rejected", "Buró de crédito rejected", "bg-red-500"],
    ["pending_final_verdict", "Pending final verdict", "bg-yellow-400"],
  ])("renders %s as a %s dot", (status, label, colorClass) => {
    render(<StatusDot status={status} />);

    const dot = screen.getByRole("img", { name: label });
    expect(dot).toHaveClass(colorClass);
  });

  it("renders pending AI verdict as a spinner, since work is actively happening", () => {
    render(<StatusDot status="pending_ai_verdict" />);

    const indicator = screen.getByRole("img", { name: "Pending AI verdict" });
    // the spinner is aria-hidden by design
    expect(indicator.firstElementChild).toHaveClass("animate-spin");
  });

  it("falls back to a neutral dot for an unrecognised status", () => {
    render(<StatusDot status="something_new" />);

    expect(screen.getByRole("img", { name: "something_new" })).toHaveClass("bg-zinc-300");
  });

  it("renders nothing without a status", () => {
    const { container } = render(<StatusDot status={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StatusWithDot", () => {
  it("shows the readable label next to the dot, never the colour alone", () => {
    render(<StatusWithDot status="complete" />);

    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Complete" })).toBeInTheDocument();
  });

  it("puts the dot to the LEFT of the status text", () => {
    render(<StatusWithDot status="complete" />);

    const dot = screen.getByRole("img", { name: "Complete" });
    const text = screen.getByText("Complete");
    // DOCUMENT_POSITION_FOLLOWING means `text` comes after `dot` in the document.
    expect(dot.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a placeholder when there is no status", () => {
    render(<StatusWithDot status={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
