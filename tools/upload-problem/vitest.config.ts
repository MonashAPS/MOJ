import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "upload-problem",
    include: ["test/**/*.test.mjs"],
    environment: "node",
  },
});
