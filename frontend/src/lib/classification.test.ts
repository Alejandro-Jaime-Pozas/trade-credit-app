/**
 * Tests for reading a document's classification status (src/lib/classification.ts).
 *
 * The status decides whether a row shows a spinner, so getting it wrong is visible: a
 * spinner on a finished document never stops, and no spinner on a running one makes the
 * app look like it dropped the upload.
 */
import { describe, expect, it } from "vitest";
import {
  anyClassifying,
  classificationStatus,
  isClassifying,
} from "./classification";
import type { UploadDocument } from "./types";

function makeDoc(overrides: Partial<UploadDocument>): UploadDocument {
  return {
    url: "http://api/upload-documents/1/",
    original_title: "doc.pdf",
    file: "http://files/doc.pdf",
    mimetype: "application/pdf",
    uploaded_at: "2026-08-17T09:00:00Z",
    ...overrides,
  } as unknown as UploadDocument;
}

describe("classificationStatus", () => {
  it("reads the status the backend sent", () => {
    expect(classificationStatus(makeDoc({ classification_status: "processing" }))).toBe(
      "processing",
    );
    expect(classificationStatus(makeDoc({ classification_status: "classified" }))).toBe(
      "classified",
    );
    expect(classificationStatus(makeDoc({ classification_status: "unclassified" }))).toBe(
      "unclassified",
    );
  });

  it("trusts the backend over the file type", () => {
    // The backend owns how long classification may take, so its verdict wins even where
    // the frontend could have guessed differently.
    const givenUp = makeDoc({
      file_type_name: null,
      classification_status: "unclassified",
    });

    expect(classificationStatus(givenUp)).toBe("unclassified");
  });

  it("falls back to the file type when the field is missing", () => {
    // Covers a payload built before the backend served this field — an open tab
    // mid-deploy, or a fixture that predates it.
    expect(classificationStatus(makeDoc({ file_type_name: "bank_statement" }))).toBe(
      "classified",
    );
    expect(classificationStatus(makeDoc({ file_type_name: null }))).toBe("processing");
  });

  it("ignores a value it does not recognise", () => {
    const odd = makeDoc({
      file_type_name: "bank_statement",
      classification_status: "something_new",
    } as Partial<UploadDocument>);

    expect(classificationStatus(odd)).toBe("classified");
  });
});

describe("isClassifying / anyClassifying", () => {
  const processing = makeDoc({ classification_status: "processing" });
  const done = makeDoc({ classification_status: "classified" });
  const givenUp = makeDoc({ classification_status: "unclassified" });

  it("is true only while the worker is still expected to answer", () => {
    expect(isClassifying(processing)).toBe(true);
    expect(isClassifying(done)).toBe(false);
    // Given up on: not classifying, so nothing should keep spinning or polling for it.
    expect(isClassifying(givenUp)).toBe(false);
  });

  it("spots a single processing document in a list", () => {
    expect(anyClassifying([done, givenUp, processing])).toBe(true);
    expect(anyClassifying([done, givenUp])).toBe(false);
  });

  it("treats no documents as nothing to wait for", () => {
    expect(anyClassifying(null)).toBe(false);
    expect(anyClassifying([])).toBe(false);
  });
});
