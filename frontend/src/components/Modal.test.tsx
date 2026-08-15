/**
 * Tests for the dialog shell (src/components/Modal.tsx).
 *
 * Every modal in the app routes its dismissal through here, so this is where the three
 * ways out are pinned: Escape, the ✕, and clicking the backdrop. Before this component
 * existed, modals hand-rolled their markup, none listened for Escape, and the
 * requirements dialog had no obvious cancel at all.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <Modal title="Are you sure?" onClose={onClose} {...props}>
      <p>Body text</p>
    </Modal>,
  );
  return onClose;
}

describe("Modal", () => {
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via the ✕ button", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();

    // The dialog's parent is the backdrop.
    // the backdrop has no role
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the click is inside the panel", async () => {
    const user = userEvent.setup();
    const onClose = renderModal();

    await user.click(screen.getByText("Body text"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("blocks every dismissal route while an action is in flight", async () => {
    const user = userEvent.setup();
    const onClose = renderModal({ busy: true });

    await user.keyboard("{Escape}");
    // the backdrop has no role
    await user.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();

    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders footer actions", () => {
    renderModal({ footer: <button type="button">Confirm</button> });

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});
