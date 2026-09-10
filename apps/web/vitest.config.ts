import path from "node:path";
import { defineConfig } from "vitest/config";

// The TypeScript `paths` in tsconfig.json are compile-time only; vitest needs
// the same two aliases to resolve `@/...` and `@convex/...` at run time.
export default defineConfig({
  resolve: {
    alias: {
      "@convex": path.join(import.meta.dirname, "../../convex"),
      "@": path.join(import.meta.dirname, "src"),
    },
  },
  test: {
    name: "web",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
