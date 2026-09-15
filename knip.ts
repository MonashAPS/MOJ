import { defineConfig } from "knip/config";

/**
 * An `@import` in a stylesheet reaches a package exactly the way an import
 * statement does, and knip reads only the files TypeScript reads. Compiling a
 * stylesheet down to its `@import` lines hands those specifiers over, so the
 * packages that arrive through `apps/web/src/app/globals.css` — `tailwindcss`,
 * `katex`, `@moj/ui` and `@moj/content` — resolve like any other import.
 */
const css = (text: string): string => {
  const imports = text.matchAll(/(?<=@)import[^;]+/g);

  return [...imports].map((match) => match[0]).join("\n");
};

export default defineConfig({
  compilers: { css },
  workspaces: {
    ".": {
      entry: ["infra/scripts/*.mjs", "lefthook.yml"],
      project: ["infra/scripts/**/*.{mjs,css}"],
      // setup.mjs spawns `npx tsx apps/web/scripts/…` with the arguments in an
      // array rather than a command line, which knip has no way to read.
      ignoreDependencies: ["tsx"],
    },
    convex: {
      entry: ["**/*.ts", "!**/*.test.ts", "!_generated/**"],
      project: ["**/*.{ts,css}", "!_generated/**"],
    },
    "apps/web": {
      entry: ["scripts/*.ts"],
      project: ["src/**/*.{ts,tsx,css}", "scripts/*.ts"],
    },
    "packages/*": {},
    "packages/content": {
      // `dist` is the tsc output that `exports` points at, so every import in it
      // is a copy of one in `src` and every dependency it names is already there.
      project: ["**/*.{ts,css}", "!dist/**"],
    },
    "tools/*": {},
    "tools/anti-slop": {
      // Vendored verbatim from upstream (see tools/anti-slop/UPSTREAM.md), so
      // the rules it carries but MOJ does not register are not dead code here.
      // `effect/` is the second plugin entry; oxlint.config.ts registers only
      // the generic one.
      entry: ["effect/index.ts", "shared/**/*.ts", "vendor/**/*.ts"],
    },
    docs: {},
  },
});
