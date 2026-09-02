/**
 * Tests for the pure custom-field helpers (src/lib/labels.ts).
 *
 * Only the non-API half is covered here — the wrappers are exercised through the pages
 * that call them. What is pinned below is the handful of rules that would fail silently
 * and confusingly if they broke: a user-named field colliding with a built-in column,
 * a whitespace value reading as a real one, a duplicate field name slipping past the
 * client into a generic backend 400, and Spanish names sorting by byte value.
 */
import { describe, expect, it } from "vitest";
import {
  customFieldValue,
  isLabelColumnId,
  labelColumnId,
  sortLabels,
  validateLabelName,
  LABEL_NAME_MAX_LENGTH,
} from "./labels";
import type { Label } from "./types";

/** A Label is only ever read here by `id` and `name`, so the rest is filled in loosely. */
function label(id: number, name: string): Label {
  return { id, name } as Label;
}

describe("labelColumnId / isLabelColumnId", () => {
  it("keeps a field named after a built-in column from colliding with it", () => {
    // A user is entitled to call their field "status". Without the prefix its column id
    // would be the literal "status", and the built-in Status column's filter and sort
    // would drive the custom one (and vice versa).
    const custom = labelColumnId(label(7, "status"));
    expect(custom).not.toBe("status");
    expect(custom).toBe("label:7");
  });

  it("is keyed by id, so two fields never share a column id", () => {
    expect(labelColumnId(label(1, "sucursal"))).not.toBe(labelColumnId(label(2, "sucursal")));
  });

  it("recognises its own ids and rejects built-in ones", () => {
    expect(isLabelColumnId(labelColumnId(label(7, "status")))).toBe(true);
    expect(isLabelColumnId("status")).toBe(false);
    expect(isLabelColumnId("created")).toBe(false);
  });
});

describe("customFieldValue", () => {
  it("reads the value recorded under the field's name", () => {
    expect(customFieldValue({ sucursal: "MTY Norte" }, "sucursal")).toBe("MTY Norte");
  });

  it("returns null for a field the object has no value for", () => {
    // The normal state of a case that existed before the field was created.
    expect(customFieldValue({ sucursal: "MTY Norte" }, "vendedor")).toBeNull();
    expect(customFieldValue({}, "sucursal")).toBeNull();
    expect(customFieldValue(null, "sucursal")).toBeNull();
    expect(customFieldValue(undefined, "sucursal")).toBeNull();
  });

  it("treats an empty or whitespace-only value as no value", () => {
    // Otherwise a stray space would render as a blank-looking cell that still counted
    // as a distinct value in the column's filter options.
    expect(customFieldValue({ sucursal: "" }, "sucursal")).toBeNull();
    expect(customFieldValue({ sucursal: "   " }, "sucursal")).toBeNull();
    expect(customFieldValue({ sucursal: "\t\n" }, "sucursal")).toBeNull();
  });
});

describe("validateLabelName", () => {
  const existing = [label(1, "sucursal"), label(2, "vendedor")];

  it("rejects an empty or whitespace-only name", () => {
    expect(validateLabelName("", existing)).toBe("Enter a field name.");
    expect(validateLabelName("   ", existing)).toBe("Enter a field name.");
  });

  it("rejects a name longer than the backend column accepts", () => {
    const tooLong = "a".repeat(LABEL_NAME_MAX_LENGTH + 1);
    expect(validateLabelName(tooLong, existing)).toContain(`${LABEL_NAME_MAX_LENGTH} characters`);
    // Exactly at the limit is fine.
    expect(validateLabelName("a".repeat(LABEL_NAME_MAX_LENGTH), existing)).toBeNull();
  });

  it("rejects a duplicate regardless of case or surrounding space", () => {
    // "Sucursal" and "sucursal" would be two columns the user cannot tell apart.
    expect(validateLabelName("Sucursal", existing)).toBe(
      'A field named "Sucursal" already exists.',
    );
    expect(validateLabelName("  sucursal  ", existing)).toBe(
      'A field named "sucursal" already exists.',
    );
  });

  it("accepts a name nothing else is using", () => {
    expect(validateLabelName("región", existing)).toBeNull();
  });

  it("lets a rename keep its own name via ignoreId", () => {
    // Without ignoreId, re-saving a field — or just fixing its capitalisation — would
    // be rejected as clashing with itself.
    expect(validateLabelName("sucursal", existing, { ignoreId: 1 })).toBeNull();
    expect(validateLabelName("Sucursal", existing, { ignoreId: 1 })).toBeNull();
    // It still may not take a name another field already holds.
    expect(validateLabelName("vendedor", existing, { ignoreId: 1 })).toBe(
      'A field named "vendedor" already exists.',
    );
  });
});

describe("sortLabels", () => {
  it("orders accented Spanish names where a reader expects them", () => {
    // Byte order would put "Ángel" and "Órden" after "Zona"; es-MX collation does not.
    const sorted = sortLabels([
      label(1, "Zona"),
      label(2, "Ángel"),
      label(3, "Órden"),
      label(4, "Nivel"),
      label(5, "Ñu"),
    ]);
    expect(sorted.map((l) => l.name)).toEqual(["Ángel", "Nivel", "Ñu", "Órden", "Zona"]);
  });

  it("ignores case, so a capitalised field doesn't jump the list", () => {
    const sorted = sortLabels([label(1, "vendedor"), label(2, "Sucursal")]);
    expect(sorted.map((l) => l.name)).toEqual(["Sucursal", "vendedor"]);
  });

  it("leaves the caller's array untouched", () => {
    const input = [label(1, "Zona"), label(2, "Ángel")];
    sortLabels(input);
    expect(input.map((l) => l.name)).toEqual(["Zona", "Ángel"]);
  });
});
