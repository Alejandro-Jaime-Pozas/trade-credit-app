/**
 * Tests for the classification polling hook (src/lib/useClassificationPolling.ts).
 *
 * The contract has two halves and both matter: it must keep asking while a worker is
 * still classifying (otherwise the file type never appears without a manual reload), and
 * it must stop the moment nothing is pending (otherwise every open tab quietly hammers
 * the API forever).
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIFICATION_POLL_MS } from "./classification";
import { useClassificationPolling } from "./useClassificationPolling";
import type { UploadDocument } from "./types";

function makeDoc(status: string, id = 1): UploadDocument {
  return {
    url: `http://api/upload-documents/${id}/`,
    original_title: `doc-${id}.pdf`,
    classification_status: status,
  } as unknown as UploadDocument;
}

const processing = makeDoc("processing");
const classified = makeDoc("classified", 2);
const givenUp = makeDoc("unclassified", 3);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useClassificationPolling", () => {
  it("re-reads on an interval while a document is being classified", () => {
    const onRefresh = vi.fn();
    renderHook(() => useClassificationPolling({ documents: [processing], onRefresh }));

    // Nothing fires immediately — the page has just loaded this data itself.
    expect(onRefresh).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS * 2));
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it("never polls when every document is already classified", () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useClassificationPolling({ documents: [classified, givenUp], onRefresh }),
    );

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS * 5));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("stops as soon as the last document finishes", () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(
      ({ documents }: { documents: UploadDocument[] }) =>
        useClassificationPolling({ documents, onRefresh }),
      { initialProps: { documents: [processing] } },
    );

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // The refresh brought back the classified version, which is the signal to stop.
    rerender({ documents: [classified] });
    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS * 5));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("starts polling once an upload appears", () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(
      ({ documents }: { documents: UploadDocument[] | null }) =>
        useClassificationPolling({ documents, onRefresh }),
      { initialProps: { documents: [] as UploadDocument[] | null } },
    );

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS));
    expect(onRefresh).not.toHaveBeenCalled();

    rerender({ documents: [processing] });
    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("holds off while disabled", () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useClassificationPolling({ documents: [processing], onRefresh, enabled: false }),
    );

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS * 5));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not restart its timer when the callback identity changes", () => {
    // Pages pass a plain function, so a new one arrives on every render. If that reset
    // the interval, a page re-rendering faster than the poll would never poll at all.
    const onRefresh = vi.fn();
    const { rerender } = renderHook(() =>
      useClassificationPolling({ documents: [processing], onRefresh: () => onRefresh() }),
    );

    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS - 100));
    rerender();
    act(() => void vi.advanceTimersByTime(100));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("stops firing once the page is unmounted", () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() =>
      useClassificationPolling({ documents: [processing], onRefresh }),
    );

    unmount();
    act(() => void vi.advanceTimersByTime(CLASSIFICATION_POLL_MS * 5));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("honours a custom interval", () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useClassificationPolling({ documents: [processing], onRefresh, intervalMs: 1000 }),
    );

    act(() => void vi.advanceTimersByTime(1000));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
