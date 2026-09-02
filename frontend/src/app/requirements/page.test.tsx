/**
 * Tests for the default required documents page (`/requirements`).
 *
 * The behaviour pinned here is the one the user asked for in `docs/bug_fixes/3/5.md`:
 * **Cancel must send nothing.** This page used to save the template, ask the backend what
 * that would do to open cases, and offer to undo — so backing out was itself a write, and
 * closing the tab mid-prompt left a default nobody had agreed to.
 *
 * The tests therefore assert on which API functions were called, not only on what ends up
 * on screen: "the template still reads the same afterwards" would pass even if the page
 * wrote it and wrote it back.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { FileType, RequirementTemplate } from "@/lib/types";
import type { TemplateImpactEntry } from "@/lib/fileTypes";

vi.mock("@/components/AppShell", () => ({
  AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

const listFileTypes = vi.fn();
const getDefaultTemplate = vi.fn();
const previewTemplateImpact = vi.fn();
const updateTemplateItems = vi.fn();
const createDefaultTemplate = vi.fn();
const applyTemplateToCases = vi.fn();

vi.mock("@/lib/fileTypes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fileTypes")>("@/lib/fileTypes");
  return {
    ...actual,
    listFileTypes: (...a: unknown[]) => listFileTypes(...a),
    getDefaultTemplate: (...a: unknown[]) => getDefaultTemplate(...a),
    previewTemplateImpact: (...a: unknown[]) => previewTemplateImpact(...a),
    updateTemplateItems: (...a: unknown[]) => updateTemplateItems(...a),
    createDefaultTemplate: (...a: unknown[]) => createDefaultTemplate(...a),
    applyTemplateToCases: (...a: unknown[]) => applyTemplateToCases(...a),
  };
});

const { default: RequirementsPage } = await import("./page");

function makeFileType(id: number, key: string, label: string): FileType {
  return {
    url: `http://api/file-types/${id}/`,
    id,
    key,
    label_en: label,
    label_es: label,
    category: "financial",
  } as unknown as FileType;
}

const BANK = makeFileType(1, "bank_statement", "Estado de cuenta");
const BALANCE = makeFileType(2, "balance_sheet", "Balance general");

const TEMPLATE = {
  url: "http://api/requirement-templates/7/",
  id: 7,
  name: "Default",
  is_default: true,
  items: [{ file_type: BANK.id, is_required: true, order: 0 }],
} as unknown as RequirementTemplate;

const IMPACT: TemplateImpactEntry[] = [
  {
    credit_case_id: 3,
    customer_name: "Gringotts",
    adds: [{ id: 2, key: "balance_sheet", label_en: "Balance sheet", label_es: "Balance general" }],
    removes: [],
    updates: [],
    removes_with_uploads: [],
  },
];

beforeEach(() => {
  for (const fn of [
    listFileTypes,
    getDefaultTemplate,
    previewTemplateImpact,
    updateTemplateItems,
    createDefaultTemplate,
    applyTemplateToCases,
  ]) {
    fn.mockReset();
  }
  listFileTypes.mockResolvedValue([BANK, BALANCE]);
  getDefaultTemplate.mockResolvedValue(TEMPLATE);
  previewTemplateImpact.mockResolvedValue([]);
  updateTemplateItems.mockResolvedValue(TEMPLATE);
  createDefaultTemplate.mockResolvedValue(TEMPLATE);
  applyTemplateToCases.mockResolvedValue(undefined);
});

/** Tick the second document on and submit, which is what raises the prompt. */
async function editAndSave(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("button", { name: "Balance general" });
  await user.click(screen.getByRole("button", { name: "Balance general" }));
  await user.click(screen.getByRole("button", { name: /Save default requirements/i }));
}

describe("saving the default requirements", () => {
  it("asks what the change would do BEFORE writing anything", async () => {
    previewTemplateImpact.mockResolvedValue(IMPACT);
    const user = userEvent.setup();
    render(<RequirementsPage />);

    await editAndSave(user);

    await screen.findByText(/Update credit cases already in progress\?/i);
    // The crux: the prompt is on screen and the template has not been touched.
    expect(previewTemplateImpact).toHaveBeenCalledTimes(1);
    expect(updateTemplateItems).not.toHaveBeenCalled();
    expect(createDefaultTemplate).not.toHaveBeenCalled();
  });

  it("saves straight away when no open case would be affected", async () => {
    previewTemplateImpact.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequirementsPage />);

    await editAndSave(user);

    await screen.findByText(/Default requirements saved\./i);
    expect(updateTemplateItems).toHaveBeenCalledTimes(1);
    // Nothing to ask about, so nothing was asked.
    expect(screen.queryByText(/Update credit cases already in progress\?/i)).toBeNull();
  });

  it("sends the file types the user actually ticked", async () => {
    previewTemplateImpact.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<RequirementsPage />);

    await editAndSave(user);

    await screen.findByText(/Default requirements saved\./i);
    const [args] = updateTemplateItems.mock.calls[0] as [{ fileTypeIds: number[] }];
    expect(args.fileTypeIds).toEqual(expect.arrayContaining([BANK.id, BALANCE.id]));
  });
});

describe("answering the prompt", () => {
  beforeEach(() => {
    previewTemplateImpact.mockResolvedValue(IMPACT);
  });

  it("Cancel sends no request at all", async () => {
    const user = userEvent.setup();
    render(<RequirementsPage />);
    await editAndSave(user);
    await screen.findByText(/Update credit cases already in progress\?/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText(/Update credit cases already in progress\?/i),
    ).toBeNull();
    // The entire point of the change: backing out writes nothing, so there is nothing
    // to undo and nothing left behind.
    expect(updateTemplateItems).not.toHaveBeenCalled();
    expect(createDefaultTemplate).not.toHaveBeenCalled();
    expect(applyTemplateToCases).not.toHaveBeenCalled();
  });

  it("Cancel leaves the user's ticked boxes alone so they can adjust", async () => {
    const user = userEvent.setup();
    render(<RequirementsPage />);
    await editAndSave(user);
    await screen.findByText(/Update credit cases already in progress\?/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Balance general" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Keep them as they are saves the default and touches no case", async () => {
    const user = userEvent.setup();
    render(<RequirementsPage />);
    await editAndSave(user);
    await screen.findByText(/Update credit cases already in progress\?/i);

    await user.click(screen.getByRole("button", { name: /Keep them as they are/i }));

    await screen.findByText(/Open credit cases were left as they are/i);
    expect(updateTemplateItems).toHaveBeenCalledTimes(1);
    expect(applyTemplateToCases).not.toHaveBeenCalled();
  });

  it("Update these cases saves the default and then applies it", async () => {
    const user = userEvent.setup();
    render(<RequirementsPage />);
    await editAndSave(user);
    await screen.findByText(/Update credit cases already in progress\?/i);

    await user.click(screen.getByRole("button", { name: /Update these cases/i }));

    await screen.findByText(/applied to open credit cases/i);
    expect(updateTemplateItems).toHaveBeenCalledTimes(1);
    const [args] = applyTemplateToCases.mock.calls[0] as [{ creditCaseIds: number[] }];
    expect(args.creditCaseIds).toEqual([3]);
  });
});

describe("an organization with no template yet", () => {
  it("creates one without previewing, since no case can be seeded from it", async () => {
    getDefaultTemplate.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<RequirementsPage />);

    await editAndSave(user);

    await screen.findByText(/Default requirements saved\./i);
    expect(previewTemplateImpact).not.toHaveBeenCalled();
    expect(createDefaultTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("when the preview fails", () => {
  it("reports the failure and writes nothing", async () => {
    previewTemplateImpact.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<RequirementsPage />);

    await editAndSave(user);

    await screen.findByText(/Failed to save requirements/i);
    expect(updateTemplateItems).not.toHaveBeenCalled();
  });
});
