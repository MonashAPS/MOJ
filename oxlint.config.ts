import { defineConfig } from "oxlint";

// Biome carries the general lint rules; oxlint runs the vendored anti-slop
// rules (tools/anti-slop/UPSTREAM.md) and the native rule they pair with.
export default defineConfig({
  ignorePatterns: [
    ".claude/**",
    ".convex-tmp/**",
    ".local/**",
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "convex/_generated/**",
    "apps/judge/**",
    "apps/web/drizzle/**",
    "apps/web/public/**",
    "docs/.vitepress/cache/**",
    "docs/public/**",
    "infra/problems/**",
    "packages/content/typst/**",
    "tools/anti-slop/**",
  ],
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/anti-slop/index.ts" }],
  categories: {
    correctness: "off",
  },
  rules: {
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
