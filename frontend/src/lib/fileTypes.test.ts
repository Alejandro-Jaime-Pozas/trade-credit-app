/**
 * Tests for how a document type's name reaches the screen (src/lib/fileTypes.ts).
 *
 * The app's users are Mexican companies, so the UI prints the Spanish name. The English
 * one is still stored and still served — it is simply not what gets shown today. Every
 * component that renders a document name goes through `fileTypeDisplayLabel`, so this is
 * the one place that decision is made, and the one place it has to be verified.
 */
import { describe, expect, it } from "vitest";
import { fileTypeDisplayLabel, fileTypeLabel } from "./fileTypes";
import type { FileType } from "./types";

function fileType(key: string, label_en: string, label_es?: string | null): FileType {
  return { id: 1, key, label_en, label_es } as unknown as FileType;
}

const CATALOG = [
  fileType("pagare", "Promissory note", "Pagaré"),
  fileType("poder_notarial", "Power of attorney", "Poder notarial de apoderados"),
];

describe("fileTypeDisplayLabel", () => {
  it("prints the Spanish name", () => {
    expect(fileTypeDisplayLabel(CATALOG[0])).toBe("Pagaré");
    expect(fileTypeDisplayLabel(CATALOG[1])).toBe("Poder notarial de apoderados");
  });

  it("falls back to English when there is no Spanish name", () => {
    // A name in the wrong language beats a blank where a name should be.
    expect(fileTypeDisplayLabel(fileType("curp", "CURP", null))).toBe("CURP");
    expect(fileTypeDisplayLabel(fileType("curp", "CURP", ""))).toBe("CURP");
    expect(fileTypeDisplayLabel(fileType("curp", "CURP", "   "))).toBe("CURP");
  });

  it("works on anything carrying the two labels, not just a full FileType", () => {
    // Requirement rows and the template-impact payload carry the labels without being
    // a whole FileType, and must print the same name.
    expect(
      fileTypeDisplayLabel({ label_en: "Trade references", label_es: "Referencias comerciales" }),
    ).toBe("Referencias comerciales");
  });
});

describe("fileTypeLabel", () => {
  it("resolves a key against the catalog and returns the Spanish name", () => {
    expect(fileTypeLabel("pagare", CATALOG)).toBe("Pagaré");
  });

  it("names the unclassified bucket in Spanish", () => {
    // `unknown` is never served by /file-types/, so without this it would print as the
    // title-cased key — an English word in a Spanish list.
    expect(fileTypeLabel("unknown", CATALOG)).toBe("Desconocido");
    expect(fileTypeLabel("unknown", null)).toBe("Desconocido");
  });

  it("says a document has no type yet when the key is missing", () => {
    expect(fileTypeLabel(null, CATALOG)).toBe("Pending classification");
    expect(fileTypeLabel(undefined, CATALOG)).toBe("Pending classification");
  });

  it("title-cases an unrecognised key rather than showing nothing", () => {
    expect(fileTypeLabel("acta_constitutiva", CATALOG)).toBe("Acta constitutiva");
  });
});
