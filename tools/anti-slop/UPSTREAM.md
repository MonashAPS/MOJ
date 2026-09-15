# Upstream

Vendored from https://github.com/dmmulroy/anti-slop, commit c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b
(2026-09-10), by copying `skills/install-anti-slop/assets/anti-slop/` (the plugin without its tests)
into this directory with the skill's `install.mjs`.

Installed entry points: `tools/anti-slop/index.ts` (generic rules, registered in `oxlint.config.ts`).
`tools/anti-slop/effect/` is present but not registered; MOJ does not use Effect.

Deviations from upstream: none in the rule sources. This directory is a workspace so that
`@oxlint/plugins` is declared where it is imported. `oxlint` and `@oxlint/plugins` are pinned to
the same exact version.

`vendor/eslint-stylistic/` carries its own LICENSE and UPSTREAM.md.
