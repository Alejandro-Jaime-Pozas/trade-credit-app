/**
 * Tests for saved list arrangements (`src/lib/layoutPrefs.ts`).
 *
 * The interesting cases are all about a saved order meeting a list that has since
 * changed: a custom field that was deleted, and one that was created after the user last
 * rearranged anything. Both are routine here, because the whole point of the feature is
 * that an arrangement outlives the session that made it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyOrder,
  EMPTY_LAYOUT,
  loadLayout,
  moveItem,
  nudgeItem,
  saveLayout,
  toggleHidden,
} from "./layoutPrefs";

type Item = { id: string };

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));
const ids = (list: Item[]) => list.map((i) => i.id);

describe("applyOrder", () => {
  it("returns the natural order when nothing has been arranged", () => {
    expect(ids(applyOrder(items("a", "b", "c"), []))).toEqual(["a", "b", "c"]);
  });

  it("puts items into the saved order", () => {
    expect(ids(applyOrder(items("a", "b", "c"), ["c", "a", "b"]))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("appends an item the saved order has never seen", () => {
    // A custom field created after the user last rearranged their columns. It has to
    // show up, and at the end, rather than silently not render at all.
    expect(ids(applyOrder(items("a", "b", "new"), ["b", "a"]))).toEqual([
      "b",
      "a",
      "new",
    ]);
  });

  it("skips a saved id that no longer exists", () => {
    // A deleted custom field. Left in, it would leave a phantom column.
    expect(ids(applyOrder(items("a", "b"), ["gone", "b", "a"]))).toEqual(["b", "a"]);
  });

  it("keeps newcomers in their own natural order", () => {
    expect(ids(applyOrder(items("a", "x", "y", "b"), ["b"]))).toEqual([
      "b",
      "a",
      "x",
      "y",
    ]);
  });
});

describe("moveItem", () => {
  it("drops an item after the target when moving right", () => {
    expect(moveItem(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("drops an item before the target when moving left", () => {
    expect(moveItem(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when dropped on itself", () => {
    expect(moveItem(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });

  it("is a no-op when the target is not in the list", () => {
    expect(moveItem(["a", "b"], "a", "ghost")).toEqual(["a", "b"]);
  });

  it("returns a complete order even from a partial one", () => {
    // The first drag in a fresh browser has to pin down every other position too,
    // otherwise the next render would reshuffle everything around the moved item.
    expect(moveItem(["a", "b", "c"], "c", "a")).toHaveLength(3);
  });
});

describe("nudgeItem", () => {
  it("moves an item one place towards the front", () => {
    expect(nudgeItem(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
  });

  it("moves an item one place towards the back", () => {
    expect(nudgeItem(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  });

  it("does nothing at the front edge", () => {
    expect(nudgeItem(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });

  it("does nothing at the back edge", () => {
    expect(nudgeItem(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
});

describe("toggleHidden", () => {
  it("hides then unhides", () => {
    expect(toggleHidden([], "a")).toEqual(["a"]);
    expect(toggleHidden(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips an arrangement", () => {
    saveLayout("demo", { order: ["b", "a"], hidden: ["c"] });
    expect(loadLayout("demo")).toEqual({ order: ["b", "a"], hidden: ["c"] });
  });

  it("returns an empty layout for a list nobody has arranged", () => {
    expect(loadLayout("never-touched")).toEqual(EMPTY_LAYOUT);
  });

  it("ignores stored junk rather than rendering a broken list", () => {
    window.localStorage.setItem("tcapp.layout.demo", "not json at all");
    expect(loadLayout("demo")).toEqual(EMPTY_LAYOUT);
  });

  it("drops non-string and duplicate entries", () => {
    window.localStorage.setItem(
      "tcapp.layout.demo",
      JSON.stringify({ order: ["a", 7, "a", null, "b"], hidden: "nope" }),
    );
    expect(loadLayout("demo")).toEqual({ order: ["a", "b"], hidden: [] });
  });
});
