import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest configuration.
 *
 * - `node` environment: the suites under test (API envelope, Prisma error
 *   mapping) run server-side and rely on the global Web `Response`/`Request`
 *   provided by Node 18+.
 * - `@` alias mirrors the `@/*` path alias used across the app so tests can
 *   import modules the same way the application code does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
});
