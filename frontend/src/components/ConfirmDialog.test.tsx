/**
 * Tests for the delete confirmation (src/components/ConfirmDialog.tsx).
 *
 * The rule this pins is that dismissing a confirmation is never consent: Escape, the ✕
 * and the backdrop all mean Cancel. Getting that backwards would turn the guard into the
 * very hazard it exists to prevent.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "./ConfirmDialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete this customer?"
      name="Acme Corp"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Delete this customer?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names what is about to be destroyed, and warns it is permanent", () => {
    renderDialog({ description: "Their credit cases go with them." });

    expect(screen.getByText("Delete this customer?")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Their credit cases go with them.")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
  });

  it("only deletes when the user explicitly confirms", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it.each([
    ["the Cancel button", async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("button", { name: "Cancel" }))],
    ["the ✕", async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole("button", { name: "Close" }))],
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => user.keyboard("{Escape}")],
  ])("treats %s as cancel, never as consent", async (_label, dismiss) => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();

    await dismiss(user);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses the caller's wording for a removal rather than a delete", () => {
    renderDialog({ confirmLabel: "Remove", title: "Remove this required document?" });

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("locks both buttons while the delete is running, so it can't be double-fired", () => {
    renderDialog({ busy: true });

    expect(screen.getByRole("button", { name: /Deleting…/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });
});
