/**
 * Tests for the in-flight upload store (src/lib/uploadTracker.ts).
 *
 * This exists because upload state used to live inside `FileUploadField`. Navigating away
 * unmounted it, so returning to the page showed an idle button while the backend was
 * still working. The store lives outside React so the fact of an upload survives that.
 *
 * `useSyncExternalStore` demands a stable snapshot reference between changes, so that is
 * pinned here too — an unstable one causes an infinite render loop rather than a visible
 * bug.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmptyUploadActivity,
  getUploadActivity,
  resetUploadTracker,
  subscribeToUploads,
  trackUpload,
} from "./uploadTracker";

/** A promise plus the handles to settle it, so a test can hold an upload open. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetUploadTracker();
});

describe("uploadTracker", () => {
  it("reports nothing in flight for an untouched scope", () => {
    expect(getUploadActivity("customer-1")).toEqual({ count: 0, fileNames: [] });
  });

  it("counts an upload while it runs and releases it when it finishes", async () => {
    const gate = deferred();
    const done = trackUpload("customer-1", ["csf.pdf"], () => gate.promise);

    expect(getUploadActivity("customer-1")).toEqual({
      count: 1,
      fileNames: ["csf.pdf"],
    });

    gate.resolve();
    await done;

    expect(getUploadActivity("customer-1")).toEqual({ count: 0, fileNames: [] });
  });

  it("releases the count when the upload fails, so it can't spin forever", async () => {
    const gate = deferred();
    const done = trackUpload("customer-1", ["csf.pdf"], () => gate.promise);
    expect(getUploadActivity("customer-1").count).toBe(1);

    gate.reject(new Error("boom"));

    // The rejection is re-thrown so the caller can still show an error.
    await expect(done).rejects.toThrow("boom");
    expect(getUploadActivity("customer-1").count).toBe(0);
  });

  it("keeps scopes separate, so one page never shows another's uploads", async () => {
    const gate = deferred();
    const done = trackUpload("customer-1", ["a.pdf"], () => gate.promise);

    expect(getUploadActivity("customer-1").count).toBe(1);
    expect(getUploadActivity("credit-case-9").count).toBe(0);

    gate.resolve();
    await done;
  });

  it("tracks concurrent uploads in one scope and lists every file", async () => {
    const first = deferred();
    const second = deferred();
    const a = trackUpload("customer-1", ["a.pdf"], () => first.promise);
    const b = trackUpload("customer-1", ["b.pdf", "c.pdf"], () => second.promise);

    const activity = getUploadActivity("customer-1");
    expect(activity.count).toBe(2);
    expect(activity.fileNames).toEqual(["a.pdf", "b.pdf", "c.pdf"]);

    first.resolve();
    await a;
    expect(getUploadActivity("customer-1")).toEqual({
      count: 1,
      fileNames: ["b.pdf", "c.pdf"],
    });

    second.resolve();
    await b;
    expect(getUploadActivity("customer-1").count).toBe(0);
  });

  it("returns the upload's own result to the caller", async () => {
    await expect(trackUpload("s", ["a.pdf"], async () => "created")).resolves.toBe(
      "created",
    );
  });

  it("notifies subscribers when an upload starts and when it settles", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUploads(listener);

    const gate = deferred();
    const done = trackUpload("customer-1", ["a.pdf"], () => gate.promise);
    expect(listener).toHaveBeenCalledTimes(1);

    gate.resolve();
    await done;
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await trackUpload("customer-1", ["b.pdf"], async () => {});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("hands out a stable snapshot reference between changes", async () => {
    // useSyncExternalStore re-renders whenever this reference changes, so building a
    // fresh object per read would loop forever rather than fail visibly.
    expect(getUploadActivity("idle")).toBe(getEmptyUploadActivity());

    const gate = deferred();
    const done = trackUpload("customer-1", ["a.pdf"], () => gate.promise);

    const first = getUploadActivity("customer-1");
    expect(getUploadActivity("customer-1")).toBe(first);

    gate.resolve();
    await done;
    expect(getUploadActivity("customer-1")).toBe(getEmptyUploadActivity());
  });
});
