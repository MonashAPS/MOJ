# MOJ, the MAPS Online Judge

![The MOJ home page](docs/public/screenshots/home.png)

MOJ is an online judge and contest platform written in TypeScript. It is a rewrite of
[DMOJ](https://github.com/DMOJ/online-judge) rather than a fork, and it stays compatible with it: the same URLs,
the same problem format, the same statement syntax, the same read API, and an importer that moves an existing DMOJ
site across with its accounts, problems, submissions and contests. Grading is done by DMOJ's own
[judge-server](https://github.com/DMOJ/judge-server), carried as a git subtree, so problem data written for DMOJ
runs unchanged. MOJ is maintained by MAPS, Monash Algorithms and Problem Solving.

## Get started

The [quick start](https://monashaps.github.io/MOJ/guide/quick-start) takes a machine with nothing installed and
ends with a working site and a judge grading a real submission. On a machine that already has Docker and Node 24:

```bash
npm ci
npm run setup
npm run dev
```

`npm run setup` brings up Postgres and the Convex backend, writes the environment files, runs the migrations,
pushes the functions, seeds the site and creates a development superuser. The site is then on
`http://localhost:3000`.

The judge sits behind a compose profile, so it starts separately:

```bash
docker compose -f infra/compose.dev.yml --project-directory . --profile judge up -d judge
```

Deployment, importing an existing DMOJ database, running a judge on another machine and everything else is
documented at [monashaps.github.io/MOJ](https://monashaps.github.io/MOJ/).

## Features

### Problem statements

Statements are DMOJ's markdown: tilde delimited maths, images, tables, code blocks with syntax highlighting, and
raw HTML in the contexts DMOJ allowed it. The box beside the statement carries the point value, the time and
memory limits with any per language overrides, the solver and attempt counts, the fastest solution and the author.
Any statement can be rendered to PDF, and a problem can carry translations that are picked by exact language code.

![A problem statement with maths, an image and the problem info box](docs/public/screenshots/problem.png)

The problem list filters on solve status, category, type, point range, author, contest and whether an editorial
exists, and the filter lives in the URL so a filtered list can be linked.

![The problem list with its filter panel](docs/public/screenshots/problem-list.png)

### Submitting in many languages

The submit page has an editor with syntax highlighting, the language list the connected judges can actually grade,
the problem's limits for the language that is selected, and an optional choice of judge. A problem can restrict
which languages it accepts and set its own limit per language.

![The submit page with a solution in the editor](docs/public/screenshots/submit.png)

### Live submission status

A submission page updates as the judge reports, without polling and without a websocket daemon to run. Cases
arrive one at a time inside their batches, each with its verdict, time, memory and whatever feedback the checker
returned. Submissions can be aborted by their author and by staff, and rejudged from the problem page or from the
staff console.

![A graded submission showing its batches and cases](docs/public/screenshots/submission-status.png)

### Submission lists

The global, per problem, per user and per contest submission lists are live for the same reason, and filter by
status, language and user. The statistics panel counts the verdicts across the range being shown.

![The global submission list](docs/public/screenshots/submissions.png)

### Contests and rankings

Contests run in DMOJ's six formats: default, IOI, the IOI 2016 subtask rules, AtCoder, ICPC and ECOO. A contest
can be rated, limited to organisations or to an access code, hidden until it ends, joined virtually afterwards,
and given a time limit each contestant spends from the moment they join. Clarifications, editorials and MOSS
plagiarism checking are part of it.

![A contest page with its problem table](docs/public/screenshots/contest.png)

Rankings show the per problem cells the format asks for, the format's tiebreak column, and virtual and spectator
participations behind toggles. Ratings are Elo-MMR, ported from DMOJ and checked against it over the same
contests.

![A contest ranking](docs/public/screenshots/contest-ranking.png)

### The hall scoreboard

A scoreboard event gathers several contests into one board for a projector, with a theme, a division switcher, an
event feed, badges and a filter for the competitors who are in the room. While the board is frozen a cell shows
only how many submissions are still withheld, and first solves are marked.

![The hall scoreboard during the freeze](docs/public/screenshots/hall-scoreboard.png)

The reveal turns the withheld cells over one at a time, from the bottom of the board upwards. It is server side
state, so the projector, the stream and the organiser's laptop all turn over the same cell at the same moment.

![The hall scoreboard in reveal mode](docs/public/screenshots/hall-scoreboard-reveal.png)

### User profiles

A profile shows the point total, the rank, the problems solved, a year of submission activity, the best
submission for every solved problem, and the rating history once the account has written a rated contest.

![A user profile](docs/public/screenshots/user.png)

### The staff console

`/admin` replaces the Django admin. It covers problems, contests, submissions, scoreboards, jobs, users,
organisations, classes, tickets, API keys, judges, languages, the navigation bar, site configuration, branding,
flat pages, the blog, licences and tags. Every edit writes a revision with a reason, and staff can impersonate an
account to see what it sees.

![The problem edit form in the staff console](docs/public/screenshots/admin-problem.png)

A contest is edited in the same place: its schedule, its settings, its freeze, the problems with their labels,
points and submission limits, and the people who may see or edit it.

![The contest problem list in the staff console](docs/public/screenshots/admin-contest.png)

### Accounts and two factor authentication

Registration, activation mail, password reset and profile editing work as they do on DMOJ, and imported accounts
keep signing in with their old passwords. A second factor is a TOTP app, which comes with single use scratch
codes, or a passkey. A passkey signs someone in on its own as well, rather than only standing as the second step.
Staff must hold a second factor on every page, not only when removing one. API tokens are minted from here and
from the staff console.

![The two factor page](docs/public/screenshots/two-factor.png)

### Themes and branding

The site has a light and a dark theme and follows the viewer's system setting until they choose one. The site
name, the wordmark, the favicon, the accent colours, the default theme and a block of custom CSS are settings in
the staff console, so an operator changes them without a deploy.

![The home page in dark mode](docs/public/screenshots/dark-home.png)

## DMOJ compatibility

- **URLs.** Every page DMOJ has is at the same path here, trailing slash included, so old links, old bookmarks
  and old scripts keep working. Two paths moved on purpose and the old ones redirect.
- **Statement syntax.** DMOJ's markdown, including `~x^2~` inline maths, the `[user:name]` link form, the same
  sanitiser allowlist per context, and translations selected by exact language code with no fallback chain.
- **`init.yml` and the judge.** `apps/judge/judge-server/` is a git subtree of the judge-server repository with a
  three file diff. MOJ never parses `init.yml`; only the judge reads it, and that is DMOJ's code. Batches and
  their dependencies, built-in and bridged checkers, interactive and signature graders, generators, archives and
  pretests all behave as they do on DMOJ.
- **Accounts.** The importer carries users with their Django password hashes verbatim, their TOTP secrets and
  scratch codes, their passkeys and their API tokens. The first sign-in verifies against the old hash and rewrites
  it, so nobody is asked to reset a password.
- **Problems, submissions, contests, ratings.** Problems with their statements, translations, editorials and
  language limits; submissions with their sources and per case results; contests with their formats,
  participations and access control; rating history, organisations, comments, blog posts, tickets and flat pages.
  Every imported row keeps its old primary key, so ids that appeared in URLs stay stable.
- **API v2 and tokens.** `/api/v2/...` is DMOJ's read API at the same paths, with DMOJ's envelope, error shape,
  filter names and capitalised booleans. A token minted by the old site keeps verifying as long as the deployment
  carries that site's `SECRET_KEY`.

Three things are deliberately different:

- **The judge pulls instead of being pushed.** There is no bridge daemon on TCP 9999. A judge polls over HTTPS, so
  it needs no inbound port, no static address and no VPN, and one behind a home NAT works like one in the rack.
  The cost is that a claim can wait up to half a second.
- **Pages are reactive queries, not an event daemon.** Submission status, submission lists, rankings, the hall
  scoreboard, ticket lists and judge status update because Convex pushes a new result to every subscriber. There
  is no websocket daemon and no polling anywhere.
- **PDFs are typeset with Typst.** The statement markdown is converted to Typst and compiled by the `typst`
  binary with its packages vendored, instead of running `pdfoid`, `mathoid` and `texoid` as sidecars.

The whole list, including the smaller differences, is in
[compatibility with DMOJ](https://monashaps.github.io/MOJ/guide/compatibility).

## Problem repositories

A problem repository holds one directory per problem. A reusable action uploads the statements, editorials, images
and metadata through the problems API and then syncs the test data to the judge boxes, so a repository's whole
workflow is a checkout and a `uses:`.

```yaml
- uses: actions/checkout@v4
- uses: MonashAPS/MOJ/actions/upload-problems@main
  with:
    judge-url: ${{ secrets.JUDGE_URL }}
    api-key: ${{ secrets.JUDGE_API_KEY }}
```

See [problem repos and CI](https://monashaps.github.io/MOJ/problems/repos-and-ci) for the inputs, the credentials
and the repository layout.

## Supported languages

The judge image decides what a judge can grade, and the tier is chosen at build time with `--build-arg TIER=`:

- `tier1` is C, C++ through C++20, Java 8, Python 2 and 3, Pascal, assembly, sed and plain text, about 1.2 GB
  built. It is the right size for a laptop, a small VPS and CI.
- `tier2` adds the mid-popularity runtimes.
- `tier3` is everything the upstream judge supports, and is considerably larger.

Tiers can be mixed across an estate. The site only offers a language on the submit page when some online judge
reports a runtime for it, and `/runtimes/` lists what the connected judges have. The full runtime list and the
sandbox details are in [DMOJ/judge-server](https://github.com/DMOJ/judge-server#supported-platforms-and-runtimes);
the image, its tiers and the pull protocol are in [`apps/judge/README.md`](apps/judge/README.md).

## Contributing

```bash
npm run lint                      # biome
npm run typecheck                 # the Convex functions and every workspace
npm test                          # vitest
npm run docs:dev --workspace docs # the documentation site
```

CI runs the same checks on pull requests and pushes, plus the web build, the tier 1 judge image and the judge end
to end test. `docs/reference/development.md` describes the layout of the repository and how to work on each part.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Licence

MOJ is free software under the GNU Affero General Public License, version 3 or later, the licence DMOJ uses. The
judge-server subtree is AGPL and keeps its own copyright. See [LICENSE](LICENSE).
