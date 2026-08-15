/**
 * Global test setup, loaded once before the suite runs (see
 * `vitest.config.mts` -> `test.setupFiles`).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't implement PointerEvent, so Testing Library's `fireEvent.pointerDown`
// builds a plain Event and coordinates like `clientX` never reach the handler. Column
// resizing is driven by pointer events, so without this its drags look like drags to
// NaN. MouseEvent already carries the coordinate properties the code reads.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

afterEach(() => {
  // Unmount any React Testing Library trees rendered by the previous test.
  cleanup();
  // `src/lib/api.ts` persists JWTs under these keys via `src/lib/storage.ts`.
  // Without this, a token set by one test would leak into the next.
  // Guarded because storage.test.ts runs under `// @vitest-environment
  // node`, where there is no `window`/`localStorage` at all.
  if (typeof localStorage !== "undefined") {
    localStorage.clear();
  }
});
