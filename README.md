# MOJ, the MAPS Online Judge

A TypeScript rewrite of DMOJ for MAPS (Monash Algorithms and Problem Solving). Same features, same URLs, same
problem-repo workflow, same accounts, DMOJ's judge-server as the grader. See `docs/SPEC.md`.

## Running it locally

```sh
npm install
npm run setup
npm run dev
```

The site is at http://localhost:3000 and the development superuser is `admin` / `admin`.
`docs/RUNBOOK.md` covers resetting the stack, every environment variable, and what to do when something breaks.

## Layout

| Path | What is in it |
| --- | --- |
| `convex/` | schema, queries, mutations, HTTP actions and crons |
| `apps/web/` | the Next.js app, Better Auth and the Drizzle migrations |
| `apps/judge/` | the DMOJ judge-server image and its Convex client |
| `packages/ui/` | design tokens and base components |
| `packages/core/` | permissions, contest formats, ratings, scoring |
| `packages/content/` | the markdown pipeline and markdown-to-Typst |
| `packages/protocol/` | zod schemas shared by the judge, problems and v2 APIs |
| `tools/import/` | the DMOJ MariaDB dump importer |
| `infra/` | compose files, Caddy, setup scripts and sample problem data |
| `docs/` | the build spec, the runbook and the documentation site |
