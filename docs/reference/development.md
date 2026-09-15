# Development

This page is for people changing MOJ itself. If you only want to run it, read the
[quick start](/guide/quick-start).

## Repository layout

```
MOJ/
  package.json          npm workspaces: apps/*, packages/*, tools/*, docs
  tsconfig.base.json
  biome.json
  vitest.config.mts     one vitest project per workspace, plus the convex tests
  convex/               schema.ts, auth.config.ts, function modules, crons.ts, http/, _generated/
  apps/web/             the Next.js app: src/app, src/components, src/lib, src/auth, drizzle/
  apps/judge/           Dockerfile, entrypoint, judge.yml template, judge-server/ (a git subtree), tests/
  packages/core/        permissions, contest formats, ratings, points, verdicts, scoreboard freeze
  packages/content/     markdown pipeline, tilde maths, sanitiser presets, Shiki, markdown to Typst
  packages/protocol/    zod schemas shared by the judge API, the problems API and API v2
  packages/ui/          tokens.css and the shared components
  tools/import/         the DMOJ importer
  tools/upload-problem/ upload-problem.mjs, used by problem repositories
  actions/upload-problems/  the reusable GitHub Action problem repositories call
  infra/                compose.dev.yml, compose.prod.yml, Caddyfile, .env.example, scripts
  docs/                 this site
```

Three rules keep the layers apart.

`packages/core` has no I/O and no runtime dependencies: it is pure functions over plain objects, which is why the
same permission check runs in a Convex query, in a Next.js server component and in a unit test.

`convex/` never imports from `apps/web`; the dependency runs one way.

**Markdown is never rendered inside Convex.** `@moj/content` pulls in Shiki, whose highlighter needs WASM, and its
package entry reaches `node:fs` and `node:child_process` through the Typst renderer, none of which belong in a
Convex isolate. Every Convex function that returns user-written text returns the markdown together with the preset
name the consumer must render it with, and the web layer renders it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | First-time setup: compose up, admin key, `.env.local`, migrations, seed data, dev superuser. |
| `npm run dev` | `convex dev` and `next dev` together. |
| `npm run build` | Builds every workspace that has a build script. |
| `npm test` | Vitest across the workspaces. |
| `npm run test:watch` | The same, in watch mode. |
| `npm run lint` | Biome check. |
| `npm run format` | Biome format, writing changes. |
| `npm run typecheck` | `tsc --noEmit` for the Convex functions and each workspace. |
| `npm run seed` | Re-runs the seed against a running deployment. |
| `npm run convex:codegen` | Regenerates `convex/_generated`. Needs a reachable deployment. |
| `npm run convex:deploy` | Pushes the Convex functions to the configured deployment. |
| `npm run e2e:judge` | Submits to `aplusb` and waits for an Accepted verdict. |
| `npm run db:migrate -w apps/web` | Applies the Drizzle migrations to the Better Auth database. |
| `npm run import -w tools/import` | The DMOJ importer, see [importing from DMOJ](/admin/import). |
| `npm run docs:dev -w docs` | This documentation site, with hot reload. |
| `npm run docs:build -w docs` | Builds the documentation site into `docs/.vitepress/dist`. |

Only the first four live at the root without a workspace flag; `db:migrate` and `import` belong to their
workspaces, so they need `-w`.

## Tests

Unit tests are Vitest and live beside the code as `*.test.ts`. The parts of the system worth testing hardest are
in `packages/core`, because they are pure: the contest formats, the rating calculation, the permission rules, the
verdict ordering and the freeze logic all take data and return data.

```bash
npm test                        # everything
npm test -- packages/core       # only tests whose path matches
npm run test:watch              # watch mode
```

Convex functions are tested with `convex-test`, which runs the real function code against an in-memory database.
Those files carry `// @vitest-environment edge-runtime` at the top, because the root project runs `node`.

Two naming rules matter under `convex/`. Convex's bundler skips any file whose basename has more than one dot, so
test files (`*.test.ts`) and their helpers (`*.fixtures.ts`, `*.setup.ts`) never reach a deployment. A
single-dot helper there would be pushed.

The judge has its own end-to-end test in `apps/judge/tests/`, driven by `e2e.py`. It stands up a mock of the judge
API, runs the real container against it, and asserts the exact event sequence for a submission that is accepted,
one that is wrong, one that times out and one that is aborted part way through. It runs in CI on every pull
request and does not need the site.

```bash
python3 apps/judge/tests/e2e.py            # against an already built moj-judge:tier1
python3 apps/judge/tests/e2e.py --build    # build first
```

## Working in a worktree

Several checkouts of the repository, each running its own dev server on its own port, is the normal way to work on
more than one branch at once. Two things bite.

**Open the dev server on `localhost`.** Next checks the origin of its own hot-reload socket against
`allowedDevOrigins`, and rejects a name it does not expect, which leaves the page unable to hydrate with no
obvious error. `localhost` is what `npm run setup` writes into `NEXT_PUBLIC_APP_URL`, `AUTH_ISSUER` and
`AUTH_RP_ID`, so it is the name everything else already agrees on.

**Cookies are shared across ports.** A browser treats `localhost:3000` and `localhost:3001` as one cookie origin,
so signing in to one worktree signs you out of the other. Adding another hostname to `allowedDevOrigins` in
`apps/web/next.config.ts` gives a second cookie origin to use for the second worktree.

Each worktree also needs its own compose project or they will fight over the same containers and ports.

## Adding a page

Pages are Next.js App Router routes under `apps/web/src/app`, and their URLs have to match DMOJ's, including the
trailing slash. The app runs with `trailingSlash: true`, so the slashed form is canonical and the proxy redirects
to it.

The shape of a page:

```tsx
// apps/web/src/app/problem/[code]/rank/page.tsx
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { ProblemRankTable } from '@/components/problems/RankTable'

export default async function ProblemRankPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const initial = await fetchQuery(api.problems.ranks, { code })
  if (!initial) return null

  return <ProblemRankTable code={code} initial={initial} />
}
```

and the client half:

```tsx
'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

export function ProblemRankTable({ code, initial }: Props) {
  const data = useQuery(api.problems.ranks, { code }) ?? initial
  // render `data`
}
```

The server component renders with real data on the first request; the client component takes over and stays live.
Do not fetch in a `useEffect`, and do not poll.

Page furniture comes from the shared layout: a title row, an optional tab bar under it, then the body. Two-column
pages put the main content in `.content-description` and the sidebar in the sticky info float. Use the components
in `packages/ui` rather than writing new ones, and the tokens in `packages/ui/src/tokens.css` rather than literal
colours. A literal colour is the usual cause of a page that looks right in one theme and wrong in the other.

If a page needs a read that no domain module exposes, put it in `convex/pages/<area>.ts` rather than widening a
domain query with page-shaped fields.

## Adding a Convex function

Functions go in the file for their area: problems in `convex/problems.ts`, contests in `convex/contests.ts`, staff
mutations under `convex/admin/`, page-only reads under `convex/pages/`.

```ts
// convex/problems.ts
import { v } from 'convex/values'
import { query } from './_generated/server'
import { optionalViewer } from './lib/auth'
import { problemIsAccessibleBy } from '@moj/core'

export const ranks = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const viewer = await optionalViewer(ctx)
    const problem = await ctx.db
      .query('problems')
      .withIndex('by_code', (q) => q.eq('code', code))
      .unique()

    if (!problem || !problemIsAccessibleBy(problem, viewer)) return null

    // ...
  },
})
```

Conventions worth following, because the rest of the codebase does:

- **Queries return `null` for "not found"** rather than throwing, so a list page can render an empty state.
  Mutations throw with a code and a message.
- **Every function that returns per-user data calls `requireViewer(ctx)` or `optionalViewer(ctx)`** from
  `convex/lib/auth.ts`. Do not read `ctx.auth` directly.
- **Permission decisions live in `packages/core`.** The Convex function loads the documents and calls the rule. A
  permission check written inline in a Convex file is a bug waiting to diverge from the one in the web app.
- **Use an index, never a filter over a full table.** If the index you need does not exist, add it to
  `convex/schema.ts`; that is what schema changes are for. Where a rule cannot be expressed as an index, the
  function scans behind the most selective index it can and caps the scan, and says so in its return value rather
  than pretending it saw everything.
- **Paginate with `paginationOptsValidator`.** Anything that can grow without bound has to be paginated, and the
  submissions table grows without bound. A page filtered for visibility after the fact can come back shorter than
  it asked for; that is normal and the client copes.
- **Argument validators are not optional.** Every function declares `args` with `v.*` validators.
- **A write that moves a profile's points goes through the ranking helpers**, because the leaderboard aggregates
  have no trigger to maintain them.

After changing the schema or adding a function, `convex dev` pushes and regenerates `convex/_generated`, which is
committed. Commit the regenerated files with your change. A module path with a slash becomes a nested key, so
`convex/admin/submissions.ts` is `api.admin.submissions.*`.

## Conventions

- TypeScript with `strict: true`, ESM everywhere. No `any` that is not commented.
- Biome for formatting and linting. Run `npm run format` before committing; CI runs `npm run lint`.
- Field names in Convex are camelCase versions of DMOJ's names, so a reviewer can find the original.
- Every imported table has `legacyId` and an index on it. Keep that true for new tables that could be imported.
- Timestamps are milliseconds since the epoch as `v.number()`. Durations are seconds unless the field name says
  otherwise. Memory is kilobytes.
- Conventional commits, lowercase imperative subject: `feat(contests): add reveal undo`.
- Do not commit `node_modules` or `.env*` other than `.env.example`. `convex/_generated` is committed.

## Working on the docs

This site is VitePress in `docs/`.

```bash
npm run docs:dev -w docs      # http://localhost:5173/MOJ/
npm run docs:build -w docs    # into docs/.vitepress/dist
```

The base path is `/MOJ/` because the site is served from a project page. Links between pages are written without
the base, as `/using/contests`, and VitePress adds it.

Adding a page means creating the markdown file and adding it to the sidebar in `docs/.vitepress/config.ts`. A page
that is not in the sidebar is still built and reachable, but nobody will find it.

The build fails on a dead internal link, which is deliberate. If a link is failing, the target file or its anchor
does not exist.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and on pushes to the main branches: `npm ci`, `npm run lint`,
`npm run typecheck`, `npm test`, a web build, and, in a second job, the tier 1 judge image build followed by the
judge end-to-end test against its mock.

`.github/workflows/pages.yml` builds `docs/` and deploys it to GitHub Pages on a push to the main branch.
