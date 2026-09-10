import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "apps/web/vitest.config.ts",
      "tools/*/vitest.config.ts",
      {
        test: {
          name: "root",
          include: ["convex/**/*.test.ts", "infra/**/*.test.mjs"],
          environment: "node",
        },
      },
    ],
  },
});
