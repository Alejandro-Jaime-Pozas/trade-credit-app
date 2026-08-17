/**
 * Tests for the shared document list (src/components/DocumentList.tsx) and the file type
 * combo it renders (src/components/FileTypeSelect.tsx).
 *
 * Two behaviours from the bug report are pinned here: uploads come back newest-first
 * (the file you just added should not be at the bottom of a long list), and a
 * misclassified document can be re-labelled — GPT gets it wrong sometimes, and a wrong
 * label silently fails to satisfy the requirement it should.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentList } from "./DocumentList";
import type { FileType, UploadDocument } from "@/lib/types";

const FILE_TYPES = [
  { id: 1, key: "bank_statement", label_en: "Bank statement" },
  { id: 2, key: "acta_constitutiva", label_en: "Acta constitutiva" },
  { id: 3, key: "constancia_de_situacion_fiscal", label_en: "Constancia de situación fiscal" },
] as unknown as FileType[];

function makeDoc(overrides: Partial<UploadDocument> & { id: number }): UploadDocument {
  return {
    url: `http://api/upload-documents/${overrides.id}/`,
    original_title: `doc-${overrides.id}.pdf`,
    file: `http://files/doc-${overrides.id}.pdf`,
    mimetype: "application/pdf",
    file_type_name: "unknown",
    uploaded_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as unknown as UploadDocument;
}

/** Document titles in the order they are rendered. */
function renderedTitles(): string[] {
  return screen.getAllByRole("listitem").map((li) => {
    const heading = within(li).getByText(/\.pdf$/);
    return heading.textContent ?? "";
  });
}

describe("DocumentList", () => {
  const oldest = makeDoc({ id: 1, original_title: "oldest.pdf", uploaded_at: "2026-01-01T09:00:00Z" });
  const middle = makeDoc({ id: 2, original_title: "middle.pdf", uploaded_at: "2026-02-01T09:00:00Z" });
  const newest = makeDoc({ id: 3, original_title: "newest.pdf", uploaded_at: "2026-03-01T09:00:00Z" });

  it("lists the most recent upload first", () => {
    // Deliberately handed over in the order the API returned them (oldest first).
    render(<DocumentList documents={[oldest, middle, newest]} fileTypes={FILE_TYPES} />);

    expect(renderedTitles()).toEqual(["newest.pdf", "middle.pdf", "oldest.pdf"]);
  });

  it("shows a loading state until documents arrive, then an empty message", () => {
    const { rerender } = render(<DocumentList documents={null} fileTypes={FILE_TYPES} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    rerender(<DocumentList documents={[]} fileTypes={FILE_TYPES} />);
    expect(screen.getByText("No uploads yet.")).toBeInTheDocument();
  });

  it("renders the type as a plain badge when it cannot be changed", () => {
    render(
      <DocumentList
        documents={[makeDoc({ id: 1, file_type_name: "bank_statement" })]}
        fileTypes={FILE_TYPES}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Change file type" }),
    ).not.toBeInTheDocument();
  });

  it("offers no rename or delete control unless the page handles them", () => {
    render(<DocumentList documents={[oldest]} fileTypes={FILE_TYPES} />);

    expect(screen.queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
  });
});

/**
 * Uploads arrive named whatever the customer's scanner called them, so a user-supplied
 * name has to win wherever the document is shown — while the file's real name stays
 * visible, since that is what identifies the actual file.
 */
describe("renaming a document", () => {
  const doc = makeDoc({ id: 1, original_title: "scan_0012.pdf" });

  function renderWithRename(onRename = vi.fn(), document = doc) {
    render(
      <DocumentList documents={[document]} fileTypes={FILE_TYPES} onRename={onRename} />,
    );
    return onRename;
  }

  it("shows the friendly name instead of the original file name", () => {
    render(
      <DocumentList
        documents={[makeDoc({ id: 1, original_title: "scan_0012.pdf", friendly_file_name: "Acta constitutiva" })]}
        fileTypes={FILE_TYPES}
      />,
    );

    expect(screen.getByText("Acta constitutiva")).toBeInTheDocument();
    // The real file name is still on screen — the user has to be able to tell which
    // file this is, not just what someone chose to call it.
    expect(screen.getByText(/scan_0012\.pdf/)).toBeInTheDocument();
  });

  it("saves a new name", async () => {
    const user = userEvent.setup();
    const onRename = renderWithRename();

    await user.click(screen.getByRole("button", { name: "Rename scan_0012.pdf" }));
    const input = screen.getByRole("textbox", { name: "Rename scan_0012.pdf" });
    await user.clear(input);
    await user.type(input, "Bank statement - March");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith(doc, "Bank statement - March");
  });

  it("seeds the box with the current name so a small edit is easy", async () => {
    const user = userEvent.setup();
    const named = makeDoc({ id: 2, original_title: "scan.pdf", friendly_file_name: "Acta" });
    renderWithRename(vi.fn(), named);

    await user.click(screen.getByRole("button", { name: "Rename Acta" }));

    expect(screen.getByRole("textbox", { name: "Rename Acta" })).toHaveValue("Acta");
  });

  it("saves on Enter", async () => {
    const user = userEvent.setup();
    const onRename = renderWithRename();

    await user.click(screen.getByRole("button", { name: "Rename scan_0012.pdf" }));
    await user.clear(screen.getByRole("textbox", { name: "Rename scan_0012.pdf" }));
    await user.type(screen.getByRole("textbox", { name: "Rename scan_0012.pdf" }), "Renamed{Enter}");

    expect(onRename).toHaveBeenCalledWith(doc, "Renamed");
  });

  it("clears the name back to null when the box is emptied", async () => {
    const user = userEvent.setup();
    const named = makeDoc({ id: 3, original_title: "scan.pdf", friendly_file_name: "Acta" });
    const onRename = renderWithRename(vi.fn(), named);

    await user.click(screen.getByRole("button", { name: "Rename Acta" }));
    await user.clear(screen.getByRole("textbox", { name: "Rename Acta" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // null, not "" — the document goes back to showing its original file name.
    expect(onRename).toHaveBeenCalledWith(named, null);
  });

  it("does nothing when the name is submitted unchanged", async () => {
    const user = userEvent.setup();
    const onRename = renderWithRename();

    await user.click(screen.getByRole("button", { name: "Rename scan_0012.pdf" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).not.toHaveBeenCalled();
  });

  it("abandons the edit on Cancel", async () => {
    const user = userEvent.setup();
    const onRename = renderWithRename();

    await user.click(screen.getByRole("button", { name: "Rename scan_0012.pdf" }));
    await user.type(screen.getByRole("textbox", { name: "Rename scan_0012.pdf" }), "typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("abandons the edit on Escape", async () => {
    const user = userEvent.setup();
    const onRename = renderWithRename();

    await user.click(screen.getByRole("button", { name: "Rename scan_0012.pdf" }));
    await user.keyboard("{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("deleting a document", () => {
  const doc = makeDoc({ id: 1, original_title: "scan_0012.pdf" });

  it("asks the page rather than deleting on its own", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <DocumentList documents={[doc]} fileTypes={FILE_TYPES} onDelete={onDelete} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete scan_0012.pdf" }));

    // The page owns the confirmation dialog — this component only raises the request.
    expect(onDelete).toHaveBeenCalledWith(doc);
  });
});

describe("correcting a misclassified document", () => {
  const doc = makeDoc({ id: 1, original_title: "acta.pdf", file_type_name: "unknown" });

  function renderWithChange(onChangeFileType = vi.fn()) {
    render(
      <DocumentList
        documents={[doc]}
        fileTypes={FILE_TYPES}
        onChangeFileType={onChangeFileType}
      />,
    );
    return onChangeFileType;
  }

  it("shows the current type on the trigger", () => {
    renderWithChange();
    // `unknown` isn't in the catalog (no customer can hand over an "unknown"
    // document), so fileTypeLabel title-cases the key itself.
    expect(
      screen.getByRole("button", { name: "Change file type" }),
    ).toHaveTextContent("Unknown");
  });

  it("lets the user search the catalog and pick a correction", async () => {
    const user = userEvent.setup();
    const onChangeFileType = renderWithChange();

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    await user.type(screen.getByRole("combobox"), "acta");

    const listbox = screen.getByRole("listbox", { name: "Document types" });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(1);

    await user.click(options[0]);

    expect(onChangeFileType).toHaveBeenCalledWith(doc, "acta_constitutiva");
  });

  it("always offers unknown as a way back", async () => {
    const user = userEvent.setup();
    const onChangeFileType = vi.fn();
    // Starts as a real type, so moving it back to unknown is an actual change.
    const labelled = makeDoc({ id: 2, file_type_name: "bank_statement" });
    render(
      <DocumentList
        documents={[labelled]}
        fileTypes={FILE_TYPES}
        onChangeFileType={onChangeFileType}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    await user.type(screen.getByRole("combobox"), "unknown");
    await user.click(screen.getByRole("option", { name: /Unknown/ }));

    expect(onChangeFileType).toHaveBeenCalledWith(labelled, "unknown");
  });

  it("does not fire a change when the current type is re-selected", async () => {
    const user = userEvent.setup();
    const onChangeFileType = renderWithChange();

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    await user.click(screen.getByRole("option", { name: /Unknown/ }));

    expect(onChangeFileType).not.toHaveBeenCalled();
  });

  it("closes on Escape without changing anything", async () => {
    const user = userEvent.setup();
    const onChangeFileType = renderWithChange();

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    expect(screen.getByRole("listbox", { name: "Document types" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChangeFileType).not.toHaveBeenCalled();
  });

  it("supports picking with the keyboard alone", async () => {
    const user = userEvent.setup();
    const onChangeFileType = renderWithChange();

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    await user.type(screen.getByRole("combobox"), "bank");
    await user.keyboard("{Enter}");

    expect(onChangeFileType).toHaveBeenCalledWith(doc, "bank_statement");
  });

  it("tells the user when a search matches nothing", async () => {
    const user = userEvent.setup();
    renderWithChange();

    await user.click(screen.getByRole("button", { name: "Change file type" }));
    await user.type(screen.getByRole("combobox"), "zzzz");

    expect(screen.getByText("No matching types.")).toBeInTheDocument();
  });
});
