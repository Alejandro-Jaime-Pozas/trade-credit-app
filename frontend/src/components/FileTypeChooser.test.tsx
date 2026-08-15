/**
 * Tests for the document requirement chooser (src/components/FileTypeChooser.tsx).
 *
 * The headline requirement guarded here is the mutual exclusion between "use my
 * organization's default" and "pick documents for this customer". These are not two
 * flavours of the same choice: on the backend, taking the default keeps the credit case
 * linked to the template (so later template edits can be offered to it), while picking
 * documents by hand opts the case out of that entirely. Letting a user do both at once
 * would make the resulting rows ambiguous.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileTypeChooser } from "./FileTypeChooser";
import type { FileType } from "@/lib/types";

function fileType(id: number, key: string, label: string): FileType {
  return {
    id,
    key,
    label_en: label,
    label_es: label,
    category: "financial",
    months_required: null,
    is_active: true,
    is_global: true,
    url: `http://test/api/v1/file-types/${id}/`,
  } as FileType;
}

const FILE_TYPES = [
  fileType(1, "bank_statement", "Bank statement"),
  fileType(2, "balance_sheet", "Balance sheet"),
  fileType(3, "income_statement", "Income statement"),
];

describe("FileTypeChooser", () => {
  it("keeps Submit disabled until something is chosen", async () => {
    const user = userEvent.setup();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        submitLabel="Submit"
        onSubmit={() => {}}
      />,
    );

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Bank statement" }));
    expect(submit).toBeEnabled();
  });

  it("switches away from Default in a single click on a document", async () => {
    // The whole point: a user who lands on Default must not have to unselect it first.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]], preselected: true }}
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Balance sheet" }));

    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({
      mode: "fileTypes",
      fileTypeIds: [2],
      saveAsDefault: false,
    });
  });

  it("switches back to Default in a single click, keeping documents selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]] }}
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Balance sheet" }));
    await user.click(screen.getByRole("button", { name: "Default" }));

    // Default wins, but the document stays visibly selected so switching back shows
    // the user exactly what they had.
    expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Balance sheet" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ mode: "default" });
  });

  it("never disables either group — both stay clickable", async () => {
    const user = userEvent.setup();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]], preselected: true }}
        submitLabel="Submit"
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Bank statement" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Bank statement" }));
    expect(screen.getByRole("button", { name: "Default" })).toBeEnabled();
  });

  it("lists the default template's documents on hover", async () => {
    const user = userEvent.setup();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0], FILE_TYPES[2]] }}
        submitLabel="Submit"
        onSubmit={() => {}}
      />,
    );

    await user.hover(screen.getByRole("button", { name: "Default" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Bank statement");
    expect(tooltip).toHaveTextContent("Income statement");
    expect(tooltip).not.toHaveTextContent("Balance sheet");
  });

  it("reports which mode the user chose", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]] }}
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Income statement" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "fileTypes",
      fileTypeIds: [3],
      saveAsDefault: false,
    });
  });

  it("reports the default mode when Default is chosen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]] }}
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Default" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({ mode: "default" });
  });

  it("does not render a Default button during first-time setup", () => {
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        submitLabel="Save my default documents"
        onSubmit={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: "Default" })).toBeNull();
  });

  it("starts with the supplied documents already selected", () => {
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        initialSelectedIds={[1, 3]}
        submitLabel="Save"
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Bank statement" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Balance sheet" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("asks whether to save as the default during first-time setup", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        saveAsDefaultQuestion="Save these as your default?"
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    // Nothing to ask about until documents are actually chosen.
    expect(screen.queryByText("Save these as your default?")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Bank statement" }));
    expect(screen.getByText("Save these as your default?")).toBeInTheDocument();

    // The question has to be answered before submitting, because the answer changes
    // what the backend is asked to do.
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "fileTypes",
      fileTypeIds: [1],
      saveAsDefault: true,
    });
  });

  it("reports a No answer to the save-as-default question", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        saveAsDefaultQuestion="Save these as your default?"
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bank statement" }));
    await user.click(screen.getByRole("button", { name: "No" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "fileTypes",
      fileTypeIds: [1],
      saveAsDefault: false,
    });
  });

  it("asks about replacing an existing default when documents are picked instead", async () => {
    // A default already exists AND the user deviated from it, so they have to say
    // whether this selection replaces that default or is just for this one case.
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]], preselected: true }}
        saveAsDefaultQuestion="Make these your NEW default?"
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    // Taking the default as-is decides nothing, so nothing is asked.
    expect(screen.queryByText("Make these your NEW default?")).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Income statement" }));

    expect(screen.getByText("Make these your NEW default?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({
      mode: "fileTypes",
      fileTypeIds: [3],
      saveAsDefault: true,
    });
  });

  it("hides the question again if the user goes back to the default", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <FileTypeChooser
        fileTypes={FILE_TYPES}
        defaultOption={{ fileTypes: [FILE_TYPES[0]], preselected: true }}
        saveAsDefaultQuestion="Make these your NEW default?"
        submitLabel="Submit"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Income statement" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Default" }));

    expect(screen.queryByText("Make these your NEW default?")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ mode: "default" });
  });
});
