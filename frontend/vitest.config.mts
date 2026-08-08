/**
 * Vitest config for the frontend unit/component test suite.
 *
 * - `tsconfigPaths()` teaches Vitest the same `@/*` -> `./src/*` alias that
 *   `tsconfig.json` defines, so test files can `import` the same way app
 *   code does.
 * - `environment: "jsdom"` gives tests a browser-like `window`/`localStorage`
 *   /`atob`, which `src/lib/api.ts` and `src/lib/storage.ts` rely on. A file
 *   can opt out per-test with a `// @vitest-environment node` comment (used
 *   by `storage.test.ts` to exercise its server-side/no-`window` branches).
 * - `env` pins two things that would otherwise make assertions flaky:
 *   the timezone (`format.ts`'s `formatDate` uses the un-pinned
 *   `toLocaleString()`) and the API base URL (`api.ts` reads
 *   `NEXT_PUBLIC_API_BASE_URL` fresh on every call).
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    env: {
      TZ: "UTC",
      NEXT_PUBLIC_API_BASE_URL: "http://test-api/api/v1",
    },
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      // Generated OpenAPI types only — no runtime code to test.
      "src/lib/api.generated.ts",
    ],
  },
});
