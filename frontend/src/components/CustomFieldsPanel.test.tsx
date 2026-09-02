/**
 * Tests for the custom fields panel (src/components/CustomFieldsPanel.tsx).
 *
 * The panel deliberately keeps no copy of the saved values: the input reads from the
 * case's `custom_fields` map unless the user has typed something, and a write is followed
 * by the parent re-reading the case. These tests pin the two halves of that contract —
 * what a row shows for a given case, and what a Save/Clear actually sends — by mocking
 * `@/lib/api` (the transport `src/lib/labels.ts` sits on) rather than `labels.ts` itself,
 * so the label-url/object-id wiring in between is exercised for real.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { CreditCase, Label } from "@/lib/types";

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

const { ApiError } = await import("@/lib/api");
const { CustomFieldsPanel } = await import("./CustomFieldsPanel");

function label(id: number, name: string, contentType = "creditcase"): Label {
  return {
    id,
    name,
    content_type: contentType,
    url: `http://test-api/api/v1/labels/${id}/`,
  } as Label;
}

const SUCURSAL = label(1, "sucursal");
const VENDEDOR = label(2, "vendedor");

/** A case carrying whatever custom field values a test needs. */
function makeCase(customFields: Record<string, string> = {}): CreditCase {
  return {
    id: 7,
    url: "http://test-api/api/v1/credit-cases/7/",
    custom_fields: customFields,
  } as unknown as CreditCase;
}

/**
 * Routes each request the way the real API would.
 *
 * `labels` is the defined-field list, `existingValues` the datalist suggestions, and
 * `labelValues` the rows `clearLabelValue` searches to find what to delete.
 */
function mockApi(options: {
  labels?: Label[];
  existingValues?: Record<number, string[]>;
  labelValues?: Array<{ url: string; object_id: number; label: { url: string } }>;
} = {}) {
  const labels = options.labels ?? [SUCURSAL, VENDEDOR];
  const labelValues = options.labelValues ?? [];

  drfListAll.mockImplementation(async ({ path }: { path: string }) => {
    if (path === "/labels/") return labels;
    if (path === "/label-values/") return labelValues;
    return [];
  });
  apiJson.mockImplementation(async ({ pathOrUrl }: { pathOrUrl: string }) => {
    const suggestion = labels.find((l) => pathOrUrl === `${l.url}existing-values/`);
    if (suggestion) return options.existingValues?.[suggestion.id] ?? [];
    return {};
  });
}

beforeEach(() => {
  drfListAll.mockReset();
  apiJson.mockReset();
});

describe("CustomFieldsPanel", () => {
  it("renders one row per defined field, showing this case's value", async () => {
    mockApi();
    render(
      <CustomFieldsPanel
        creditCase={makeCase({ sucursal: "MTY Norte" })}
        onChanged={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("sucursal")).toHaveValue("MTY Norte");
    expect(screen.getByLabelText("vendedor")).toHaveValue("");

    // A field nobody has filled in for this case reads as unset, not as an error —
    // defining a field never backfills the cases that already exist.
    expect(screen.getByText("Current: MTY Norte")).toBeInTheDocument();
    expect(screen.getByText("Current: —")).toBeInTheDocument();
  });

  it("only lists fields defined on credit cases", async () => {
    mockApi({ labels: [SUCURSAL, label(3, "giro", "customer")] });
    render(<CustomFieldsPanel creditCase={makeCase()} onChanged={vi.fn()} />);

    expect(await screen.findByLabelText("sucursal")).toBeInTheDocument();
    expect(screen.queryByLabelText("giro")).toBeNull();
  });

  it("offers the values already used elsewhere as datalist options", async () => {
    mockApi({ existingValues: { 1: ["MTY Norte", "GDL Sur"] } });
    const { container } = render(
      <CustomFieldsPanel creditCase={makeCase()} onChanged={vi.fn()} />,
    );

    await screen.findByLabelText("sucursal");
    await waitFor(() => {
      const options = container.querySelectorAll("#custom-field-options-1 option");
      expect([...options].map((o) => o.getAttribute("value"))).toEqual([
        "MTY Norte",
        "GDL Sur",
      ]);
    });
    expect(screen.getByLabelText("sucursal")).toHaveAttribute(
      "list",
      "custom-field-options-1",
    );
  });

  it("saves a typed value against the right field and case", async () => {
    const user = userEvent.setup();
    mockApi();
    const onChanged = vi.fn();
    render(<CustomFieldsPanel creditCase={makeCase()} onChanged={onChanged} />);

    await user.type(await screen.findByLabelText("vendedor"), "Ana Ruiz");
    await user.click(screen.getAllByRole("button", { name: "Save" })[1]);

    await waitFor(() =>
      expect(apiJson).toHaveBeenCalledWith({
        pathOrUrl: "/label-values/",
        method: "POST",
        body: {
          label: VENDEDOR.url,
          object_id: 7,
          value: "Ana Ruiz",
        },
      }),
    );
    // The parent owns the refetch — `custom_fields` on the case stays the only record
    // of what is saved.
    expect(onChanged).toHaveBeenCalled();
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("deletes the value row when Clear is used", async () => {
    const user = userEvent.setup();
    mockApi({
      labelValues: [
        {
          url: "http://test-api/api/v1/label-values/55/",
          object_id: 7,
          label: { url: SUCURSAL.url },
        },
      ],
    });
    const onChanged = vi.fn();
    render(
      <CustomFieldsPanel
        creditCase={makeCase({ sucursal: "MTY Norte" })}
        onChanged={onChanged}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Clear sucursal" }));

    await waitFor(() =>
      expect(apiJson).toHaveBeenCalledWith({
        pathOrUrl: "http://test-api/api/v1/label-values/55/",
        method: "DELETE",
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("clears rather than saving an empty string when the box is emptied", async () => {
    // An empty box means "no value". Saving "" would leave a row behind that then shows
    // up as a filterable option on the dashboard.
    const user = userEvent.setup();
    mockApi({
      labelValues: [
        {
          url: "http://test-api/api/v1/label-values/55/",
          object_id: 7,
          label: { url: SUCURSAL.url },
        },
      ],
    });
    render(
      <CustomFieldsPanel
        creditCase={makeCase({ sucursal: "MTY Norte" })}
        onChanged={vi.fn()}
      />,
    );

    await user.clear(await screen.findByLabelText("sucursal"));
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() =>
      expect(apiJson).toHaveBeenCalledWith({
        pathOrUrl: "http://test-api/api/v1/label-values/55/",
        method: "DELETE",
      }),
    );
    expect(apiJson).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("points at the labels page when no fields are defined yet", async () => {
    mockApi({ labels: [] });
    render(<CustomFieldsPanel creditCase={makeCase()} onChanged={vi.fn()} />);

    expect(
      await screen.findByText(/has not defined any custom fields yet/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a custom field" })).toHaveAttribute(
      "href",
      "/labels",
    );
  });

  it("surfaces the API's own message when a save fails", async () => {
    const user = userEvent.setup();
    mockApi();
    apiJson.mockImplementation(async ({ pathOrUrl, method }: { pathOrUrl: string; method?: string }) => {
      if (method === "POST") {
        throw new ApiError({
          status: 400,
          body: { value: ["This value is too long."] },
          message: "Value: This value is too long.",
        });
      }
      return pathOrUrl.endsWith("existing-values/") ? [] : {};
    });
    const onChanged = vi.fn();
    render(<CustomFieldsPanel creditCase={makeCase()} onChanged={onChanged} />);

    await user.type(await screen.findByLabelText("sucursal"), "MTY Norte");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    expect(await screen.findByText("Value: This value is too long.")).toBeInTheDocument();
    // A failed write must not make the page throw away the user's text.
    expect(screen.getByLabelText("sucursal")).toHaveValue("MTY Norte");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("surfaces a failure to load the field definitions", async () => {
    drfListAll.mockRejectedValue(
      new ApiError({ status: 500, body: { detail: "Server error." }, message: "Server error." }),
    );
    apiJson.mockResolvedValue([]);
    render(<CustomFieldsPanel creditCase={makeCase()} onChanged={vi.fn()} />);

    expect(await screen.findByText("Server error.")).toBeInTheDocument();
  });
});
