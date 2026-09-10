# Development

This page is for people changing MOJ itself. If you only want to run it, read the
[quick start](/guide/quick-start).

## Repository layout

```
MOJ/
  package.json          npm workspaces: apps/*, packages/*, tools/*, docs
  tsconfig.base.json
  biome.json
  convex/               schema.ts, auth.config.ts, function modules, crons.ts, http.ts, _generated/
  apps/web/             the Next.js app: src/app, src/components, src/lib, src/auth, drizzle/
  apps/judge/           Dockerfile, moj_packet.py, entrypoint, judge.yml template, tests/
  packages/core/        permissions, contest formats, ratings, points, verdicts, scoreboard freeze
  packages/content/     markdown pipeline, tilde maths, sanitiser presets, Shiki, markdown to Typst
  packages/protocol/    zod schemas shared by the judge API, the problems API and API v2
  packages/ui/          tokens.css and the shared components
  tools/import/         the DMOJ importer
  tools/upload-problem/ upload-problem.mjs, used by problem repositories
  infra/                compose.dev.yml, compose.prod.yml, Caddyfile, env examples, scripts
  docs/                 this site
```

Two rules keep the layers apart. `packages/core` has no I/O: it is pure functions over plain objects, which is why
the same permission check runs in a Convex query, in a Next.js server component and in a unit test. And `convex/`
never imports from `apps/web`: the dependency runs one way.

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | First-time setup: compose up, admin key, `.env.local`, migrations, seed data. |
| `npm run dev` | `convex dev` and `next dev` together. |
| `npm run build` | Builds every workspace that has a build script. |
| `npm test` | Vitest across the workspaces. |
| `npm run lint` | Biome check. |
| `npm run format` | Biome format, writing changes. |
| `npm run typecheck` | `tsc --noEmit` for the Convex functions and each workspace. |
| `npm run e2e:judge` | Submits to `aplusb` and waits for an Accepted verdict. |
| `npm run import` | The DMOJ importer, see [importing from DMOJ](/admin/import). |
| `npm run docs:dev -w docs` | This documentation site, with hot reload. |
| `npm run docs:build -w docs` | Builds the documentation site into `docs/.vitepress/dist`. |

On the club's build machine, prefix anything that installs, builds or tests with `taskset -c 0-11,14-31`.

## Tests

Unit tests are Vitest and live beside the code as `*.test.ts`. The parts of the system worth testing hardest are
in `packages/core`, because they are pure: the contest formats, the rating calculation, the permission rules, the
verdict ordering and the freeze logic all take data and return data.

```bash
npm test                        # everything
npm test -- packages/core       # one workspace
npm run test:watch              # watch mode
```

The judge has its own end-to-end test in `apps/judge/tests/`, driven by `e2e.py`. It stands up a mock of the judge
API, runs the judge against it, and checks the sequence of events for a submission that passes and one that fails.
It runs in CI on every pull request and does not need the site.

```bash
python3 apps/judge/tests/e2e.py
```

The browser smoke test is Playwright in `apps/web`. It is not part of `npm test`, because it needs the compose
stack up:

```bash
docker compose -f infra/compose.dev.yml up -d
npm run dev &
npx playwright test -w apps/web
```

In CI that job is gated on the `RUN_E2E` repository variable, so it runs when you ask for it rather than on every
push.

## Adding a page

Pages are Next.js App Router routes under `apps/web/src/app`, and their URLs have to match DMOJ's. Check
`docs/SPEC.md` section 8 for the exact path, including the trailing slash, before you create a directory.

The shape of a page:

```tsx
// apps/web/src/app/problem/[code]/rank/page.tsx
import { fetchQuery } from 'convex/nextjs'
import { api } from '@/convex/_generated/api'
import { ProblemRankTable } from '@/components/problem/problem-rank-table'

export default async function ProblemRankPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const initial = await fetchQuery(api.problems.rank, { code })
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
  const data = useQuery(api.problems.rank, { code }) ?? initial
  // render `data`
}
```

The server component renders with real data on the first request; the client component takes over and stays live.
Do not fetch in a `useEffect`, and do not poll.

Page furniture comes from the shared layout: an `h2` title row, an optional tab bar under it, an `hr`, then the
body. Two-column pages put the main content in `.content-description` and the sidebar in `.info-float`. Use the
components in `packages/ui` rather than writing new ones, and use the tokens in `packages/ui/src/tokens.css`
rather than literal colours.

## Adding a Convex function

Functions go in the file for their area: problems in `convex/problems.ts`, contests in `convex/contests.ts`, staff
mutations under `convex/admin/`.

```ts
// convex/problems.ts
import { v } from 'convex/values'
import { query } from './_generated/server'
import { optionalViewer } from './lib/auth'
import { problemIsAccessibleBy } from '@moj/core/permissions'

export const rank = query({
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
  Mutations throw `ConvexError` with `{ code, message }`.
- **Every function that returns per-user data calls `requireViewer(ctx)` or `optionalViewer(ctx)`** from
  `convex/lib/auth.ts`. Do not read `ctx.auth` directly.
- **Permission decisions live in `packages/core`.** The Convex function loads the documents and calls the rule.
  A permission check written inline in a Convex file is a bug waiting to diverge from the one in the web app.
- **Use an index, never a filter over a full table.** If the index you need does not exist, add it to
  `convex/schema.ts`; that is what schema changes are for.
- **Paginate with `paginationOptsValidator`.** Anything that can grow without bound has to be paginated, and the
  submissions table grows without bound.
- **Argument validators are not optional.** Every function declares `args` with `v.*` validators.

After changing the schema or adding a function, `convex dev` pushes and regenerates `convex/_generated`, which is
committed. Commit the regenerated files with your change.

## Conventions

- TypeScript with `strict: true`, ESM everywhere. No `any` that is not commented.
- Biome for formatting and linting. Run `npm run format` before committing; CI runs `npm run lint`.
- Field names in Convex are camelCase versions of DMOJ's names, so a reviewer can find the original.
- Every imported table has `legacyId` and an index on it. Keep that true for new tables that could be imported.
- Timestamps are milliseconds since the epoch as `v.number()`. Durations are seconds unless the field name says
  otherwise. Memory is kilobytes.
- Conventional commits, lowercase imperative subject: `feat(contests): add reveal undo`. No attribution trailers.
- Do not commit `node_modules`, `.env*` other than `.env.example`, or `package-lock.json` from a feature branch.
  `convex/_generated` is committed.

## Working on the docs

This site is VitePress in `docs/`.

```bash
npm run docs:dev -w docs      # http://localhost:5173/MOJ/
npm run docs:build -w docs    # into docs/.vitepress/dist
```

The base path is `/MOJ/` because the site is served from a project page under the MonashAPS organisation. Links
between pages are written without the base, as `/using/contests`, and VitePress adds it.

Adding a page means creating the markdown file and adding it to the sidebar in `docs/.vitepress/config.ts`. A page
that is not in the sidebar is still built and reachable, but nobody will find it.

The build fails on a dead internal link, which is deliberate. If a link is failing, the target file or its anchor
does not exist.
