/**
 * Tests for grouping the document catalog (src/lib/fileTypeGroups.ts).
 *
 * The catalog is 22 types and growing, so the picker's usability rests entirely on these
 * three: groups come back in the reading order the backend declares, search finds a
 * document by any of the names a user might type for it, and nothing is ever silently
 * dropped from the list.
 */
import { describe, expect, it } from "vitest";
import {
  groupFileTypes,
  searchFileTypes,
  suggestedFileTypeIds,
} from "./fileTypeGroups";
import type { FileType } from "./types";

function fileType(
  id: number,
  key: string,
  label_en: string,
  group?: { group: string; group_label: string; group_order: number },
  extra: Partial<FileType> = {},
): FileType {
  return {
    id,
    key,
    label_en,
    label_es: label_en,
    category: "other",
    is_active: true,
    is_global: true,
    ...group,
    ...extra,
  } as unknown as FileType;
}

const FINANCIAL = { group: "financial", group_label: "Financial", group_order: 0 };
const TAX = { group: "tax", group_label: "Tax / SAT", group_order: 1 };
const LEGAL = { group: "legal", group_label: "Legal / corporate", group_order: 2 };

const CATALOG = [
  fileType(3, "acta_constitutiva", "Articles of incorporation", LEGAL),
  fileType(1, "bank_statement", "Bank statement", FINANCIAL),
  fileType(2, "cfdi_facturas", "CFDI invoices", TAX),
  fileType(4, "balance_sheet", "Balance sheet", FINANCIAL),
];

describe("groupFileTypes", () => {
  it("orders groups the way the backend declares, not alphabetically", () => {
    const groups = groupFileTypes(CATALOG);

    // Alphabetically this would be Financial, Legal, Tax — which is not how anyone reads
    // a credit file.
    expect(groups.map((g) => g.label)).toEqual([
      "Financial",
      "Tax / SAT",
      "Legal / corporate",
    ]);
  });

  it("collects every type under its own heading", () => {
    const groups = groupFileTypes(CATALOG);

    expect(groups[0].fileTypes.map((f) => f.label_en)).toEqual([
      "Bank statement",
      "Balance sheet",
    ]);
    expect(groups[2].fileTypes.map((f) => f.label_en)).toEqual([
      "Articles of incorporation",
    ]);
  });

  it("loses nothing", () => {
    const total = groupFileTypes(CATALOG).flatMap((g) => g.fileTypes).length;

    expect(total).toBe(CATALOG.length);
  });

  it("files an ungrouped type under a trailing Other rather than dropping it", () => {
    // A type the backend did not group — an older payload, or a type added before the
    // catalog gave it a home. Showing it under a vague heading beats hiding it.
    const groups = groupFileTypes([...CATALOG, fileType(9, "mystery", "Mystery document")]);

    const last = groups[groups.length - 1];
    // Spanish, like every heading the backend sends — see FILE_TYPE_GROUPS.
    expect(last.label).toBe("Otros");
    expect(last.fileTypes.map((f) => f.key)).toEqual(["mystery"]);
  });

  it("returns nothing for an empty catalog", () => {
    expect(groupFileTypes([])).toEqual([]);
  });
});

describe("searchFileTypes", () => {
  it("matches the English label", () => {
    expect(searchFileTypes(CATALOG, "bank").map((f) => f.key)).toEqual(["bank_statement"]);
  });

  it("matches the Spanish label", () => {
    // The users are Mexican companies: they will type "acta", not "articles".
    const spanish = [fileType(1, "acta_constitutiva", "Articles of incorporation", LEGAL, {
      label_es: "Acta constitutiva",
    } as Partial<FileType>)];

    expect(searchFileTypes(spanish, "acta").map((f) => f.key)).toEqual(["acta_constitutiva"]);
  });

  it("matches the key, so a half-remembered slug still finds it", () => {
    expect(searchFileTypes(CATALOG, "cfdi").map((f) => f.key)).toEqual(["cfdi_facturas"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(searchFileTypes(CATALOG, "  BANK ").map((f) => f.key)).toEqual(["bank_statement"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchFileTypes(CATALOG, "   ")).toHaveLength(CATALOG.length);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchFileTypes(CATALOG, "zzzz")).toEqual([]);
  });
});

describe("suggestedFileTypeIds", () => {
  it("returns only the types the catalog recommends", () => {
    const catalog = [
      fileType(1, "bank_statement", "Bank statement", FINANCIAL, {
        is_default_suggestion: true,
      } as Partial<FileType>),
      fileType(2, "cfdi_facturas", "CFDI invoices", TAX),
    ];

    expect(suggestedFileTypeIds(catalog)).toEqual([1]);
  });

  it("is empty when nothing is flagged", () => {
    expect(suggestedFileTypeIds(CATALOG)).toEqual([]);
  });
});
