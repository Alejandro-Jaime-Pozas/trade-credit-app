/**
 * Tests for the required-documents editor on the credit case detail page.
 *
 * The behaviour pinned here is what `docs/bug_fixes/3/5.md` asked for: edits are a draft
 * until Done, and Done raises the same three-way prompt the Requirements page raises —
 * update everything, only this case, or cancel.
 *
 * The important assertions are about what was NOT called. Every edit used to be written
 * the instant it was clicked, which left "Done" meaning nothing and gave the user no way
 * back. So these tests check that ticking and unticking alone reaches no API at all.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type {
  CreditCase,
  CreditCaseRequirement,
  Customer,
  FileType,
  Label,
  Organization,
  RequirementTemplate,
} from "@/lib/types";
import type { TemplateImpactEntry } from "@/lib/fileTypes";

vi.mock("@/components/AppShell", () => ({
  AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const apiJson = vi.fn();
const drfListAll = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiJson: (...a: unknown[]) => apiJson(...a),
    drfListAll: (...a: unknown[]) => drfListAll(...a),
    apiForm: vi.fn(),
  };
});

const listCreditCaseLabels = vi.fn();
const listExistingValues = vi.fn();
const setLabelValue = vi.fn();
const clearLabelValue = vi.fn();
const createLabel = vi.fn();
const listFileTypes = vi.fn();
const listCreditCaseRequirements = vi.fn();
const getDefaultTemplate = vi.fn();
const previewTemplateImpact = vi.fn();
const addCreditCaseRequirement = vi.fn();
const removeCreditCaseRequirement = vi.fn();
const updateTemplateItems = vi.fn();
const createDefaultTemplate = vi.fn();
const applyTemplateToCases = vi.fn();

vi.mock("@/lib/labels", async () => {
  const actual = await vi.importActual<typeof import("@/lib/labels")>("@/lib/labels");
  return {
    ...actual,
    listCreditCaseLabels: (...a: unknown[]) => listCreditCaseLabels(...a),
    listExistingValues: (...a: unknown[]) => listExistingValues(...a),
    setLabelValue: (...a: unknown[]) => setLabelValue(...a),
    clearLabelValue: (...a: unknown[]) => clearLabelValue(...a),
    createLabel: (...a: unknown[]) => createLabel(...a),
  };
});

vi.mock("@/lib/fileTypes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fileTypes")>("@/lib/fileTypes");
  return {
    ...actual,
    listFileTypes: (...a: unknown[]) => listFileTypes(...a),
    listCreditCaseRequirements: (...a: unknown[]) => listCreditCaseRequirements(...a),
    getDefaultTemplate: (...a: unknown[]) => getDefaultTemplate(...a),
    previewTemplateImpact: (...a: unknown[]) => previewTemplateImpact(...a),
    addCreditCaseRequirement: (...a: unknown[]) => addCreditCaseRequirement(...a),
    removeCreditCaseRequirement: (...a: unknown[]) => removeCreditCaseRequirement(...a),
    updateTemplateItems: (...a: unknown[]) => updateTemplateItems(...a),
    createDefaultTemplate: (...a: unknown[]) => createDefaultTemplate(...a),
    applyTemplateToCases: (...a: unknown[]) => applyTemplateToCases(...a),
  };
});

const { default: CreditCaseDetailPage } = await import("./page");

const CASE_URL = "http://api/credit-cases/5/";
const CUSTOMER_URL = "http://api/customers/2/";

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

const CREDIT_CASE = {
  url: CASE_URL,
  id: 5,
  customer: { url: CUSTOMER_URL, display: "Gringotts" },
  status: "missing_documents",
  verdict: "pending",
  requested_amount: "1000",
  requested_term_days: 30,
  currency: "MXN",
  submitted_at: null,
  required_file_type_names: ["bank_statement"],
  optional_file_type_names: [],
  requirements_complete: false,
  custom_fields: {},
} as unknown as CreditCase;

const CUSTOMER = { url: CUSTOMER_URL, id: 2, name: "Gringotts" } as unknown as Customer;

const ORGANIZATION = {
  url: "http://api/organizations/1/",
  id: 1,
  name: "Hogwarts",
  default_verdict_days: 7,
} as unknown as Organization;

const SUCURSAL = {
  url: "http://api/labels/7/",
  id: 7,
  name: "sucursal",
  content_type: "creditcase",
} as unknown as Label;

const REQUIREMENT = {
  url: "http://api/credit-case-requirements/11/",
  id: 11,
  file_type_key: "bank_statement",
  is_required: true,
} as unknown as CreditCaseRequirement;

const TEMPLATE = {
  url: "http://api/requirement-templates/7/",
  id: 7,
  name: "Default",
  is_default: true,
  items: [{ file_type: BANK.id, is_required: true, order: 0 }],
} as unknown as RequirementTemplate;

const OTHER_CASE_IMPACT: TemplateImpactEntry[] = [
  {
    credit_case_id: 9,
    customer_name: "Ollivanders",
    adds: [{ id: 2, key: "balance_sheet", label_en: "Balance sheet", label_es: "Balance general" }],
    removes: [],
    updates: [],
    removes_with_uploads: [],
  },
];

beforeEach(() => {
  for (const fn of [
    apiJson,
    drfListAll,
    listCreditCaseLabels,
    listExistingValues,
    setLabelValue,
    clearLabelValue,
    createLabel,
    listFileTypes,
    listCreditCaseRequirements,
    getDefaultTemplate,
    previewTemplateImpact,
    addCreditCaseRequirement,
    removeCreditCaseRequirement,
    updateTemplateItems,
    createDefaultTemplate,
    applyTemplateToCases,
  ]) {
    fn.mockReset();
  }
  apiJson.mockImplementation(async ({ pathOrUrl }: { pathOrUrl: string }) =>
    pathOrUrl === CUSTOMER_URL ? CUSTOMER : CREDIT_CASE,
  );
  // Path-aware: the page asks for users and for the organization from the same helper.
  drfListAll.mockImplementation(async ({ path }: { path: string }) =>
    path === "/organizations/" ? [ORGANIZATION] : [],
  );
  listCreditCaseLabels.mockResolvedValue([SUCURSAL]);
  // Per label: only "sucursal" has ever been filled in, so a field created mid-test
  // starts with nothing to offer — which is the honest starting state for a new field.
  listExistingValues.mockImplementation(async (label: Label) =>
    label.id === SUCURSAL.id ? ["MTY Norte", "GDL"] : [],
  );
  setLabelValue.mockResolvedValue(undefined);
  clearLabelValue.mockResolvedValue(undefined);
  createLabel.mockResolvedValue(SUCURSAL);
  listFileTypes.mockResolvedValue([BANK, BALANCE]);
  listCreditCaseRequirements.mockResolvedValue([REQUIREMENT]);
  getDefaultTemplate.mockResolvedValue(TEMPLATE);
  previewTemplateImpact.mockResolvedValue([]);
  addCreditCaseRequirement.mockResolvedValue(undefined);
  removeCreditCaseRequirement.mockResolvedValue(undefined);
  updateTemplateItems.mockResolvedValue(TEMPLATE);
  createDefaultTemplate.mockResolvedValue(TEMPLATE);
  applyTemplateToCases.mockResolvedValue(undefined);
});

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  render(<CreditCaseDetailPage />);
  await screen.findByText("Estado de cuenta");
  await user.click(screen.getByRole("button", { name: "Edit" }));
}

/** Queue the removal of the one document this case currently requires. */
async function queueRemoval(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Remove Estado de cuenta" }));
}

describe("editing requirements is a draft", () => {
  it("queues a removal without sending anything", async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await queueRemoval(user);

    // Still on screen, marked, and undoable — not deleted behind the user's back.
    expect(screen.getByText("Removing")).toBeInTheDocument();
    expect(removeCreditCaseRequirement).not.toHaveBeenCalled();
  });

  it("undoes a queued removal", async () => {
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);

    await user.click(screen.getByRole("button", { name: "Undo Estado de cuenta" }));

    expect(screen.queryByText("Removing")).toBeNull();
    expect(removeCreditCaseRequirement).not.toHaveBeenCalled();
  });

  it("Done with no edits closes the editor and sends nothing", async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(previewTemplateImpact).not.toHaveBeenCalled();
    expect(addCreditCaseRequirement).not.toHaveBeenCalled();
  });
});

describe("the Done prompt", () => {
  it("previews the change before writing anything", async () => {
    previewTemplateImpact.mockResolvedValue(OTHER_CASE_IMPACT);
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);

    await user.click(screen.getByRole("button", { name: "Done" }));

    await screen.findByText(/Make this your default and update cases in progress\?/i);
    expect(removeCreditCaseRequirement).not.toHaveBeenCalled();
    expect(updateTemplateItems).not.toHaveBeenCalled();
  });

  it("leaves this case out of the list of affected cases", async () => {
    previewTemplateImpact.mockResolvedValue([
      ...OTHER_CASE_IMPACT,
      { ...OTHER_CASE_IMPACT[0], credit_case_id: 5, customer_name: "Gringotts" },
    ]);
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);

    await user.click(screen.getByRole("button", { name: "Done" }));

    // The case being edited is written directly, so listing it too would double-count it.
    await screen.findByText(/Ollivanders #9/);
    expect(screen.queryByText(/Gringotts #5/)).toBeNull();
  });

  it("Cancel writes nothing and keeps the draft on screen", async () => {
    previewTemplateImpact.mockResolvedValue(OTHER_CASE_IMPACT);
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/Make this your default/i);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(removeCreditCaseRequirement).not.toHaveBeenCalled();
    expect(updateTemplateItems).not.toHaveBeenCalled();
    expect(applyTemplateToCases).not.toHaveBeenCalled();
    // The draft survives so the user can keep adjusting rather than start over.
    expect(screen.getByText("Removing")).toBeInTheDocument();
  });

  it("Only this case writes the draft and leaves the default alone", async () => {
    previewTemplateImpact.mockResolvedValue(OTHER_CASE_IMPACT);
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/Make this your default/i);

    await user.click(screen.getByRole("button", { name: "Only this case" }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(removeCreditCaseRequirement).toHaveBeenCalledWith(REQUIREMENT);
    expect(updateTemplateItems).not.toHaveBeenCalled();
    expect(applyTemplateToCases).not.toHaveBeenCalled();
  });

  it("Update all writes the draft, the default, and the other open cases", async () => {
    previewTemplateImpact.mockResolvedValue(OTHER_CASE_IMPACT);
    const user = userEvent.setup();
    await openEditor(user);
    await queueRemoval(user);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await screen.findByText(/Make this your default/i);

    await user.click(screen.getByRole("button", { name: "Update all" }));

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(removeCreditCaseRequirement).toHaveBeenCalledWith(REQUIREMENT);
    // The list saved as the default is the one the user built, not what was there before.
    const [templateArgs] = updateTemplateItems.mock.calls[0] as [
      { fileTypeIds: number[] },
    ];
    expect(templateArgs.fileTypeIds).toEqual([]);
    const [applyArgs] = applyTemplateToCases.mock.calls[0] as [
      { creditCaseIds: number[] },
    ];
    expect(applyArgs.creditCaseIds).toEqual([9]);
  });
});

/**
 * The Details section now holds everything: the case's own fields AND the
 * organization's custom fields, which used to live in a separate panel below.
 */
describe("the Details section", () => {
  async function loadPage() {
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });
  }

  it("shows a custom field alongside the built-in ones", async () => {
    await loadPage();

    const details = screen.getByRole("heading", { name: "Details" }).closest("section");
    expect(details).not.toBeNull();
    // Both kinds of field in the same section, which is the whole change.
    expect(within(details!).getByRole("combobox", { name: "sucursal" })).toBeInTheDocument();
    expect(within(details!).getByRole("combobox", { name: "Status" })).toBeInTheDocument();
  });

  it("marks a custom field so it can be told apart from a built-in one", async () => {
    await loadPage();

    expect(screen.getByRole("button", { name: "Custom field" })).toBeInTheDocument();
  });

  it("offers the values already in use rather than a bare text box", async () => {
    const user = userEvent.setup();
    await loadPage();

    await user.click(screen.getByRole("button", { name: "Show existing values" }));

    expect(screen.getByRole("option", { name: "MTY Norte" })).toBeInTheDocument();
  });

  it("offers to create a value that does not exist yet", async () => {
    const user = userEvent.setup();
    await loadPage();

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");

    // The reported confusion: users believed a new value had to be defined somewhere
    // else first. There is nowhere else — a value exists once a case uses it.
    expect(
      screen.getByRole("option", { name: /Create .*Puebla/ }),
    ).toBeInTheDocument();
  });

  it("saves a value created that way with the rest of Details", async () => {
    const user = userEvent.setup();
    await loadPage();

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");
    await user.click(screen.getByRole("option", { name: /Create .*Puebla/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setLabelValue).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 5, value: "Puebla" }),
    );
  });

  it("puts the organization's actual deadline in the placeholder", async () => {
    await loadPage();

    // "Organization default" told the user a default existed without telling them what
    // it was, which is the one thing needed to decide whether to override it.
    expect(
      screen.getByRole("spinbutton", { name: "Verdict deadline (days)" }),
    ).toHaveAttribute("placeholder", "7 (organization default)");
  });

  it("hides the deadline explanation behind an info icon", async () => {
    await loadPage();

    const tip = screen.getByRole("button", {
      name: /Leave blank to use your organization's default deadline/i,
    });
    expect(tip).toBeInTheDocument();
  });

  it("offers USD as well as MXN", async () => {
    await loadPage();

    const currency = screen.getByRole("combobox", { name: "Currency" });
    expect(within(currency).getByRole("option", { name: "USD" })).toBeInTheDocument();
    expect(within(currency).getByRole("option", { name: "MXN" })).toBeInTheDocument();
  });
});

describe("saving custom field values", () => {
  it("writes them with the section's own Save button", async () => {
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });

    await user.click(screen.getByRole("button", { name: "Show existing values" }));
    await user.click(screen.getByRole("option", { name: "GDL" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // One Save for the whole section — a per-card button would have been the one thing
    // in it that did not look like everything else.
    expect(setLabelValue).toHaveBeenCalledWith(
      expect.objectContaining({ objectId: 5, value: "GDL" }),
    );
  });

  it("treats an emptied box as a delete, not a save of an empty string", async () => {
    apiJson.mockImplementation(async ({ pathOrUrl }: { pathOrUrl: string }) =>
      pathOrUrl === CUSTOMER_URL
        ? CUSTOMER
        : { ...CREDIT_CASE, custom_fields: { sucursal: "MTY Norte" } },
    );
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    const box = await screen.findByRole("combobox", { name: "sucursal" });

    await user.clear(box);
    await user.click(screen.getByRole("button", { name: "Save" }));

    // A saved empty string would live on as a filterable "" option on the dashboard.
    expect(clearLabelValue).toHaveBeenCalled();
    expect(setLabelValue).not.toHaveBeenCalled();
  });

  it("counts a changed custom field as unsaved work", async () => {
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });

    const discard = screen.getByRole("button", { name: "Discard changes" });
    expect(discard).toBeDisabled();

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");

    // Otherwise Discard sits greyed out over a box the user has visibly changed.
    expect(discard).toBeEnabled();
  });

  it("discards a typed value without writing anything", async () => {
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });

    await user.type(screen.getByRole("combobox", { name: "sucursal" }), "Puebla");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByRole("combobox", { name: "sucursal" })).toHaveValue("");
    expect(setLabelValue).not.toHaveBeenCalled();
  });
});

describe("adding a field from the case", () => {
  it("creates the field and shows it straight away", async () => {
    const VENDEDOR = {
      url: "http://api/labels/8/",
      id: 8,
      name: "vendedor",
      content_type: "creditcase",
    } as unknown as Label;
    createLabel.mockResolvedValue(VENDEDOR);
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });

    await user.click(screen.getByRole("button", { name: /Add field/ }));
    await user.type(screen.getByRole("textbox", { name: "New field name" }), "vendedor");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(createLabel).toHaveBeenCalledWith("vendedor");
    // Usable immediately, which is normally why the user wanted it.
    expect(await screen.findByRole("combobox", { name: "vendedor" })).toBeInTheDocument();
  });

  it("refuses a name the organization already uses, without asking the server", async () => {
    const user = userEvent.setup();
    render(<CreditCaseDetailPage />);
    await screen.findByRole("combobox", { name: "sucursal" });

    await user.click(screen.getByRole("button", { name: /Add field/ }));
    await user.type(screen.getByRole("textbox", { name: "New field name" }), "sucursal");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // The backend's unique constraint comes back as a generic 400 that reads badly.
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(createLabel).not.toHaveBeenCalled();
  });
});
