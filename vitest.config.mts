import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "convex/vitest.config.ts",
      "packages/*/vitest.config.ts",
      "apps/web/vitest.config.ts",
      "tools/*/vitest.config.ts",
    ],
  },
});
