/**
 * Global test setup, loaded once before the suite runs (see
 * `vitest.config.mts` -> `test.setupFiles`).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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
