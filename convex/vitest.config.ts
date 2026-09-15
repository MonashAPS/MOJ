import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "convex",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
  },
});
