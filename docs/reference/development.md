# Development

For changing MOJ itself. To run it, read [installation](/guide/installation).

## Layout

```
MOJ/
  convex/               schema.ts, auth.config.ts, crons.ts, _generated/
    contests/ problems/ profiles/ jobs/ admin/ pages/ http/ lib/
  apps/web/             src/app, src/components, src/lib, src/auth, drizzle/
  apps/judge/           Dockerfile, entrypoint, judge.yml.template, judge-server/ (subtree), tests/
  packages/core/        permissions, contest formats, ratings, points, verdicts, freeze
  packages/content/     markdown pipeline, sanitiser presets, markdown to Typst
  packages/protocol/    zod schemas shared by the judge API, the problems API and API v2
  packages/ui/          tokens.css and the shared components
  tools/                anti-slop rules, the DMOJ importer, upload-problem.mjs
  actions/upload-problems/  the reusable GitHub Action
  infra/                compose files, Caddyfile, .env.example, scripts
  docs/                 this site
```

`packages/core` has no I/O and no runtime dependencies. `convex/` never imports from `apps/web`. Markdown is
never rendered inside Convex: a function returns the markdown together with the preset name the web layer must
render it with. A module's path is its API path, so `convex/contests/tools.ts` is `api.contests.tools.*`, and
Convex's bundler skips any file whose basename has more than one dot, which is why `*.test.ts` never ships.

`apps/judge/judge-server/` is a git subtree of DMOJ's judge-server. Update it with
`git subtree pull --prefix apps/judge/judge-server https://github.com/dmoj/judge-server.git master --squash`,
then rebuild the image and run the judge end-to-end test.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Compose up, admin key, `.env.local`, migrations, seed, development admin and regular user. |
| `npm run dev` | `convex dev` and `next dev` together. |
| `npm run build` | Every workspace with a build script. |
| `npm test`, `npm run test:watch` | Vitest across the workspaces. |
| `npm run lint`, `npm run lint:fix` | Biome check then oxlint, with the anti-slop rules. |
| `npm run format`, `npm run typecheck`, `npm run knip` | Formatting, `tsc --noEmit`, unused files and exports. |
| `npm run seed` | Re-runs the seed against a running deployment. |
| `npm run convex:codegen`, `npm run convex:deploy` | Regenerate `convex/_generated`; push the functions. |
| `npm run e2e:judge` | Submits to `aplusb` and waits for Accepted. |
| `npm run db:migrate -w apps/web` | Migrations for the account database. |
| `npm run import -w tools/import` | The [DMOJ importer](/admin/import). |
| `npm run docs:dev -w docs`, `npm run docs:build -w docs` | This site, at `http://localhost:5173/`. |

::: tip
On NixOS the Biome binary will not start on its own. Run it through `steam-run`, or set
`BIOME="steam-run npx biome"`, which lefthook honours.
:::

## Test user credentials

Open `/accounts/login/`.

| Account | Username | Password |
| --- | --- | --- |
| Regular user | `dev` | `moj-user-local` |
| Administrator | `admin` | `moj-admin-local` |

Setup creates both accounts. Use the regular account to check participant access and restricted problem
entries; the administrator bypasses contest list restrictions. Override the defaults with
`MOJ_USER_USERNAME`, `MOJ_USER_PASSWORD`, `MOJ_USER_EMAIL` and the corresponding `MOJ_ADMIN_*` variables before
running `npm run setup`.

Rerunning setup repairs the credentials and restores the regular account to a non-staff, non-superuser account
with no permissions or two-factor enrolment.

For admin 2FA, use scratch code `mojde-vcode1`. Each code works once; the remaining codes are
`mojde-vcode2`, `mojde-vcode3`, `mojde-vcode4`, and `mojde-vcode5`.

## Tests

Unit tests live beside the code as `<module>.test.ts`, helpers as `test.*.ts` or `*.fixtures.ts`, fixture data in
`__fixtures__/` and file snapshots in `__snapshots__/`. Convex functions are tested with `convex-test` against an
in-memory database, and those files carry `// @vitest-environment edge-runtime`; `convex/test.setup.ts` holds
`setupTest()` and `judgeClient()`, and `convex/test.fixtures.ts` the row builders.

```bash
npm test -- packages/core
python3 apps/judge/tests/e2e.py --build
```

The judge's end-to-end test stands up a mock of the judge API, runs the real container against it, and asserts
the event sequence for accepted, wrong, timed-out and aborted submissions, and for data from the site and from
local disk. It needs no site.

## Conventions

- TypeScript with `strict: true`, ESM everywhere. No uncommented `any`.
- Queries return `null` for "not found"; mutations throw with a code and a message.
- Every function returning per-user data calls `requireViewer(ctx)` or `optionalViewer(ctx)` from
  `convex/lib/auth.ts`. Never read `ctx.auth` directly.
- Permission decisions live in `packages/core`; the Convex function loads documents and calls the rule.
- Use an index, never a filter over a full table, and add the index to `convex/schema.ts` if it is missing. Where
  a rule cannot be an index, cap the scan and say so in the return value.
- Paginate anything unbounded with `paginationOptsValidator`. Argument validators are not optional.
- A write that moves a profile's points goes through the ranking helpers.
- Page-shaped reads go in `convex/pages/<area>.ts` rather than widening a domain query.
- Use `packages/ui` and the tokens in `packages/ui/src/tokens.css`, never a literal colour.
- Field names are camelCase versions of DMOJ's. Timestamps are epoch milliseconds, durations seconds, memory
  kilobytes. Every importable table has `legacyId` and an index on it.
- Conventional commits, lowercase imperative subject. `convex/_generated` is committed; `.env*` other than
  `.env.example` is not.

Routes must match DMOJ's URLs including the trailing slash. Open the development server on `localhost`, not
another name, or hot reload is rejected; and because a browser shares cookies across ports, a second worktree
needs a second hostname in `allowedDevOrigins` and its own compose project.

## This site

VitePress in `docs/`, served at the root of `moj.monashaps.com`; links between pages are absolute, as
`/using/contests`. A new page needs an entry in the sidebar in `docs/.vitepress/config.ts`. The build fails on a
dead internal link.

`.github/workflows/ci.yml` runs lint, typecheck, knip, tests, a web build and the tier 1 judge image with its
end-to-end test. `.github/workflows/pages.yml` publishes `docs/` on a push to the main branch.
