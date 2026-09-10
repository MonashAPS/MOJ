import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The TypeScript `paths` in tsconfig.json are compile-time only; vitest needs
// the same two aliases to resolve `@/...` and `@convex/...` at run time.
export default defineConfig({
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "web",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
