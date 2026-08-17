/**
 * Tests for the auto-dismissing confirmation hook (src/lib/useTransientMessage.ts).
 *
 * The behaviour being pinned is the whole point of the hook: a "Saved." message that the
 * user does not have to dismiss, and that never lingers long enough to describe a save
 * that happened minutes ago.
 *
 * Fake timers throughout — a real 4-second wait in a unit test is 4 seconds of nothing.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSIENT_MESSAGE_MS, useTransientMessage } from "./useTransientMessage";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTransientMessage", () => {
  it("starts with nothing showing", () => {
    const { result } = renderHook(() => useTransientMessage());
    expect(result.current.message).toBeNull();
  });

  it("shows the message, then takes it down on its own", () => {
    const { result } = renderHook(() => useTransientMessage());

    act(() => result.current.show("Saved."));
    expect(result.current.message).toBe("Saved.");

    // Still up a moment before the deadline — it must be readable, not a flash.
    act(() => void vi.advanceTimersByTime(TRANSIENT_MESSAGE_MS - 1));
    expect(result.current.message).toBe("Saved.");

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.message).toBeNull();
  });

  it("restarts the countdown when a second message replaces the first", () => {
    const { result } = renderHook(() => useTransientMessage());

    act(() => result.current.show("First."));
    act(() => void vi.advanceTimersByTime(TRANSIENT_MESSAGE_MS - 500));
    act(() => result.current.show("Second."));

    // The first message's timer must not carry over and hide the second one early.
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.message).toBe("Second.");

    act(() => void vi.advanceTimersByTime(TRANSIENT_MESSAGE_MS));
    expect(result.current.message).toBeNull();
  });

  it("clears immediately when asked", () => {
    const { result } = renderHook(() => useTransientMessage());

    act(() => result.current.show("Saved."));
    act(() => result.current.clear());

    expect(result.current.message).toBeNull();
  });

  it("honours a custom duration", () => {
    const { result } = renderHook(() => useTransientMessage(1000));

    act(() => result.current.show("Saved."));
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.message).toBeNull();
  });

  it("cancels its pending timer when the page unmounts", () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useTransientMessage());

    act(() => result.current.show("Saved."));
    unmount();

    // Without this the timeout would fire against an unmounted component — the classic
    // "navigated away mid-confirmation" warning.
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
