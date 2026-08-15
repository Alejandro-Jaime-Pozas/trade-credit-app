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
