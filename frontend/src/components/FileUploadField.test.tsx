/**
 * Tests for the upload control (src/components/FileUploadField.tsx).
 *
 * The behaviour being pinned is the point of the component: choosing files IS the
 * instruction to upload. There is no Upload button to press afterwards, so a regression
 * that reintroduced one — or that failed to fire on selection — would leave files
 * silently un-uploaded.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUploadField } from "./FileUploadField";
import { resetUploadTracker } from "@/lib/uploadTracker";

function makeFile(name = "statement.pdf") {
  return new File(["content"], name, { type: "application/pdf" });
}

/** The visually-hidden native input the styled label drives. */
function fileInput(): HTMLInputElement {
  // input type=file has no role
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("FileUploadField", () => {
  it("uploads as soon as a file is chosen, with no separate button", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadField onUpload={onUpload} />);

    expect(screen.queryByRole("button", { name: /^Upload$/ })).not.toBeInTheDocument();

    await user.upload(fileInput(), makeFile());

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0].map((f: File) => f.name)).toEqual(["statement.pdf"]);
  });

  it("passes every file through when multiple are chosen", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadField multiple onUpload={onUpload} />);

    await user.upload(fileInput(), [makeFile("a.pdf"), makeFile("b.pdf")]);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0]).toHaveLength(2);
  });

  it("shows a loading state naming the files while the upload is in flight", async () => {
    const user = userEvent.setup();
    let resolveUpload: () => void = () => {};
    const onUpload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    render(<FileUploadField onUpload={onUpload} />);

    await user.upload(fileInput(), makeFile("acta.pdf"));

    expect(await screen.findByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByText(/Uploading acta\.pdf/)).toBeInTheDocument();
    expect(fileInput()).toBeDisabled();

    resolveUpload();
    await waitFor(() => expect(screen.queryByText("Uploading…")).not.toBeInTheDocument());
    expect(fileInput()).not.toBeDisabled();
  });

  it("surfaces an upload failure and offers a retry", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockRejectedValue(new Error("Upload failed: server said no"));
    render(<FileUploadField onUpload={onUpload} />);

    await user.upload(fileInput(), makeFile());

    expect(await screen.findByText(/server said no/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("lets the same file be chosen again after a failure", async () => {
    const user = userEvent.setup();
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    render(<FileUploadField onUpload={onUpload} />);

    await user.upload(fileInput(), makeFile("same.pdf"));
    await screen.findByText(/boom/);

    // The input is cleared after each selection, so re-picking the SAME file still
    // fires a change event — otherwise a failed upload could never be retried.
    await user.upload(fileInput(), makeFile("same.pdf"));

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
  });

  it("does not upload when the picker is dismissed without choosing anything", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<FileUploadField onUpload={onUpload} />);

    await user.upload(fileInput(), []);

    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe("uploads in progress survive navigation", () => {
  beforeEach(() => {
    resetUploadTracker();
  });

  it("still reports an upload started before this mount, and names its files", async () => {
    const user = userEvent.setup();
    let finishUpload: () => void = () => {};
    const onUpload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );

    // Start an upload, then unmount — the user navigating to another page.
    const first = render(
      <FileUploadField scope="customer-1" onUpload={onUpload} />,
    );
    await user.upload(fileInput(), makeFile("csf.pdf"));
    await screen.findByText("Uploading…");
    first.unmount();

    // Coming back to the page while the backend is still working: the indicator must
    // return, rather than showing an idle button as it used to.
    render(<FileUploadField scope="customer-1" onUpload={onUpload} />);
    expect(screen.getByText("Uploading…")).toBeInTheDocument();
    expect(screen.getByText(/Uploading csf\.pdf/)).toBeInTheDocument();

    finishUpload();
    await waitFor(() => expect(screen.queryByText("Uploading…")).not.toBeInTheDocument());
  });

  it("tells the page to refresh when a background upload finishes", async () => {
    const user = userEvent.setup();
    let finishUpload: () => void = () => {};
    const onUpload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishUpload = resolve;
        }),
    );
    const onBackgroundUploadsSettled = vi.fn();

    const first = render(<FileUploadField scope="cc-9" onUpload={onUpload} />);
    await user.upload(fileInput(), makeFile("acta.pdf"));
    await screen.findByText("Uploading…");
    first.unmount();

    render(
      <FileUploadField
        scope="cc-9"
        onUpload={onUpload}
        onBackgroundUploadsSettled={onBackgroundUploadsSettled}
      />,
    );

    finishUpload();

    // Nothing on this mount awaited that upload, so without this callback the new
    // document would never appear until a manual refresh.
    await waitFor(() => expect(onBackgroundUploadsSettled).toHaveBeenCalled());
  });

  it("does not report another scope's uploads", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn(() => new Promise<void>(() => {}));

    const first = render(<FileUploadField scope="customer-1" onUpload={onUpload} />);
    await user.upload(fileInput(), makeFile("csf.pdf"));
    await screen.findByText("Uploading…");
    first.unmount();

    render(<FileUploadField scope="customer-2" onUpload={onUpload} />);
    expect(screen.queryByText("Uploading…")).not.toBeInTheDocument();
  });
});
