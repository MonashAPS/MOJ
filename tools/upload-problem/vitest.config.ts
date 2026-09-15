import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "upload-problem",
    include: ["*.test.mjs"],
    environment: "node",
  },
});
