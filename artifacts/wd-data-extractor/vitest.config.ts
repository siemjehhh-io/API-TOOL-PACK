import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config — completely separate from vite.config.ts (production build).
 *
 * This config controls ONLY the test runner and never affects:
 *   - The dev server (npm run dev)
 *   - The production build (npm run build)
 *   - The deployed bundle to VPS
 *
 * Tests live in `tests/**` and are excluded from the TS project tsconfig.json.
 * They import parser functions from `src/pages/*` purely for verification —
 * the imported source files are not modified in any way.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Run tests from the dedicated `tests/` directory
    include: ["tests/**/*.test.{ts,tsx}"],
    // Use Node environment by default — parsers are pure functions, no DOM needed
    environment: "node",
    // Show full diff on assertion failures
    globals: true,
    // Provide friendly reporter output during local development
    reporters: ["default"],
  },
});
