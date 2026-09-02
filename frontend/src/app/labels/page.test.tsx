/**
 * Integration tests for the custom fields page.
 *
 * `labels.test.ts` covers the pure helpers; this file covers the wiring — that the page
 * shows the organization's credit case fields, that each of create/rename/delete sends
 * the request it claims to, and above all that a delete is never sent without the user
 * confirming it (deleting a field takes every value recorded under it with it).
 *
 * `@/lib/api` and the auth-dependent shell components are mocked so the page can render
 * without a backend or a logged-in session.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { Label } from "@/lib/types";

// AppShell/RequireAuth pull in the auth context and next/navigation; the page under
// test doesn't need either, so they render as pass-throughs.
vi.mock("@/components/AppShell", () => ({
  AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

const drfListAll = vi.fn();
const apiJson = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    drfListAll: (...args: unknown[]) => drfListAll(...args),
    apiJson: (...args: unknown[]) => apiJson(...args),
  };
});

const { default: LabelsPage } = await import("./page");

function makeLabel(id: number, name: string, contentType = "creditcase"): Label {
  return {
    url: `http://api/labels/${id}/`,
    id,
    name,
    content_type: contentType,
  } as Label;
}

/**
 * Two credit case fields plus one belonging to a different model, so the tests also
 * prove the page shows only the fields that are actually credit case columns.
 */
function makeLabels(): Label[] {
  return [
    makeLabel(1, "sucursal"),
    makeLabel(2, "vendedor"),
    makeLabel(3, "giro", "customer"),
  ];
}

beforeEach(() => {
  drfListAll.mockReset();
  apiJson.mockReset();
  drfListAll.mockResolvedValue(makeLabels());
  // Default: no values recorded, which is what the delete confirmation asks for first.
  apiJson.mockResolvedValue([]);
});

/** Renders the page and waits for the initial list to arrive. */
async function renderPage() {
  render(<LabelsPage />);
  await screen.findByText("sucursal");
}

/** The api calls that actually wrote something, ignoring reads. */
function writeCalls() {
  return apiJson.mock.calls
    .map(([args]) => args as { pathOrUrl: string; method?: string; body?: unknown })
    .filter((args) => args.method && args.method !== "GET");
}

describe("the field list", () => {
  it("lists the organization's credit case fields and nothing else", async () => {
    await renderPage();

    expect(screen.getByText("sucursal")).toBeInTheDocument();
    expect(screen.getByText("vendedor")).toBeInTheDocument();
    // Belongs to `customer`, so it is not a credit case column and must not appear here.
    expect(screen.queryByText("giro")).not.toBeInTheDocument();
  });

  it("says so when the organization has no custom fields yet", async () => {
    drfListAll.mockResolvedValue([]);
    render(<LabelsPage />);

    expect(await screen.findByText(/No custom fields yet/)).toBeInTheDocument();
  });

  it("warns up front that existing credit cases are not backfilled", async () => {
    await renderPage();

    // The single most surprising thing about this feature, so it is on the page itself
    // rather than only in the code.
    expect(
      screen.getByText(/credit cases that already exist show .* until someone fills it in/i),
    ).toBeInTheDocument();
  });
});

describe("creating a field", () => {
  it("posts the new field and shows it in the list", async () => {
    const user = userEvent.setup();
    apiJson.mockResolvedValue(makeLabel(9, "región"));
    await renderPage();

    await user.type(screen.getByLabelText("New field name"), "región");
    await user.click(screen.getByRole("button", { name: "Add field" }));

    expect(await screen.findByText("región")).toBeInTheDocument();
    expect(writeCalls()).toEqual([
      {
        pathOrUrl: "/labels/",
        method: "POST",
        body: { name: "región", content_type: "creditcase" },
      },
    ]);
  });

  it("tells the user the new field starts empty on existing cases", async () => {
    const user = userEvent.setup();
    apiJson.mockResolvedValue(makeLabel(9, "región"));
    await renderPage();

    await user.type(screen.getByLabelText("New field name"), "región");
    await user.click(screen.getByRole("button", { name: "Add field" }));

    expect(
      await screen.findByText(/Existing credit cases have no value for it yet/),
    ).toBeInTheDocument();
  });

  it("rejects a duplicate name without sending a request", async () => {
    const user = userEvent.setup();
    await renderPage();

    // Different capitalisation, same field — two columns the user could not tell apart.
    await user.type(screen.getByLabelText("New field name"), "Sucursal");
    await user.click(screen.getByRole("button", { name: "Add field" }));

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(writeCalls()).toEqual([]);
  });

  it("rejects an empty name without sending a request", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Add field" }));

    expect(await screen.findByText("Enter a field name.")).toBeInTheDocument();
    expect(writeCalls()).toEqual([]);
  });
});

describe("renaming a field", () => {
  it("PATCHes only the name and shows the new one", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Rename sucursal" }));
    const input = screen.getByLabelText("Rename sucursal");
    await user.clear(input);
    await user.type(input, "plaza");

    apiJson.mockResolvedValue(makeLabel(1, "plaza"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("plaza")).toBeInTheDocument();
    expect(screen.queryByText("sucursal")).not.toBeInTheDocument();
    // No content_type in the body: repointing a label at another model would orphan
    // every value already recorded under it.
    expect(writeCalls()).toEqual([
      { pathOrUrl: "http://api/labels/1/", method: "PATCH", body: { name: "plaza" } },
    ]);
  });

  it("lets a field keep its own name, but not take another field's", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Rename sucursal" }));
    const input = screen.getByLabelText("Rename sucursal");
    await user.clear(input);
    await user.type(input, "vendedor");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(writeCalls()).toEqual([]);

    // Only its capitalisation changed, which is a clash with itself and must be allowed.
    await user.clear(input);
    await user.type(input, "Sucursal");
    apiJson.mockResolvedValue(makeLabel(1, "Sucursal"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Sucursal")).toBeInTheDocument();
  });

  it("abandons the edit on Cancel", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Rename sucursal" }));
    await user.type(screen.getByLabelText("Rename sucursal"), "-nuevo");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("sucursal")).toBeInTheDocument();
    expect(writeCalls()).toEqual([]);
  });
});

describe("deleting a field", () => {
  it("asks for confirmation first and sends nothing until the user agrees", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Delete sucursal" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this custom field?")).toBeInTheDocument();
    expect(within(dialog).getByText("sucursal")).toBeInTheDocument();
    // The field is still listed, and nothing has been deleted.
    expect(writeCalls()).toEqual([]);
  });

  it("reports how much is recorded for the field before destroying it", async () => {
    const user = userEvent.setup();
    apiJson.mockResolvedValue(["CDMX", "GDL", "MTY Norte"]);
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Delete sucursal" }));

    // Counted from the backend so the warning is concrete rather than a blank
    // "are you sure?" — the values go with the field.
    expect(
      await screen.findByText(/3 distinct values are recorded for this field/),
    ).toBeInTheDocument();
    expect(screen.getByText(/CDMX, GDL, MTY Norte/)).toBeInTheDocument();
    expect(apiJson).toHaveBeenCalledWith({
      pathOrUrl: "http://api/labels/1/existing-values/",
    });
  });

  it("says plainly when nothing is recorded yet", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Delete sucursal" }));

    expect(
      await screen.findByText(/No credit case has a value for this field yet/),
    ).toBeInTheDocument();
  });

  it("deletes only after the user confirms", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Delete sucursal" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(writeCalls()).toEqual([
      { pathOrUrl: "http://api/labels/1/", method: "DELETE" },
    ]);
    // Gone from the list; the other field is untouched.
    expect(await screen.findByText(/were deleted/)).toBeInTheDocument();
    expect(screen.queryByText("sucursal")).not.toBeInTheDocument();
    expect(screen.getByText("vendedor")).toBeInTheDocument();
  });

  it("keeps the field when the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole("button", { name: "Delete sucursal" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(writeCalls()).toEqual([]);
    expect(screen.getByText("sucursal")).toBeInTheDocument();
  });
});
