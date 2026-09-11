# Compatibility with DMOJ

MOJ is a TypeScript rewrite of DMOJ. It is not a fork: no Django, no Celery, no bridge daemon. What it keeps is
everything that faces outward, so that a site, its problem repositories, its scripts and its bookmarks can move
across without being rewritten.

This page lists what is the same, what the importer brings across, and what is deliberately different.

## The same URLs

All DMOJ URLs work. Every path DMOJ serves is served here, including the trailing slash, or redirects to the page
that replaces it: `/problems/`, `/problem/aplusb`, `/problem/aplusb/submit`, `/submissions/user/alice/`,
`/submission/12345`, `/contest/spring26/ranking/`, `/user/alice/solved`, `/organization/3-example`,
`/accounts/login/`, `/accounts/password/reset/confirm/<token>/`, `/feed/blog/atom/`, `/api/v2/problems`. Old
links, old bookmarks and old scripts keep working.

The web app runs with `trailingSlash: true`, so DMOJ's canonical form is MOJ's canonical form. A request without
the slash is redirected to the one with it.

## The same problem format

The judge is the DMOJ judge-server. A problem directory written for DMOJ grades on MOJ unchanged: the same
`init.yml`, the same test data layout, the same checkers, graders, generators, interactors and pretests. MOJ
never parses `init.yml` at all. It is read only by the judge, which is DMOJ's own code.

That covers batches and batch `dependencies`, `points: null` inside a batch, the built-in checkers and their
arguments, `bridged` checkers built on testlib, `custom_judge` graders including interactive ones,
`signature_grader`, `generator`, `archive`, `pretest_test_cases`, `output_prefix_length`,
`output_limit_length`, `wall_time_factor`, `unbuffered`, `symlinks` and `hints`. See
[problem format](/problems/format).

What is new beside `init.yml` is `config.json`: the problem's metadata for the site, which DMOJ had no file for
because its metadata was typed into the Django admin. A repository without one still uploads its statement.

## The same statement syntax

Statements are DMOJ's markdown, rendered by `packages/content` through remark and rehype with DMOJ's sanitiser
allowlists per context (problem, comment, blog, editorial, flat page and the rest).

- **Tilde maths.** `~x^2~` is inline maths, which is DMOJ's own convention. `\(...\)` is inline as well; `$$...$$`,
  `\[...\]` and fenced maths are display. `$...$` inline maths is a MOJ addition, on by default; DMOJ has no
  single-dollar rule.
- One deliberate difference: `~...~` may not span a line ending. DMOJ compiles the rule with `re.DOTALL`, so an
  unbalanced tilde swallows the rest of the paragraph. MOJ stops at the newline.
- Headings are demoted by two levels, as DMOJ's renderer does unconditionally.
- `[user:name]` and `[ruser:name]` render as user links with the rating colour.
- Code fences are highlighted with Shiki rather than Pygments, under the same `codehilite` wrapper class.
- Images are deferred with `loading="lazy"` and `decoding="async"` instead of DMOJ's placeholder image plus its
  unveil script.
- Raw HTML is allowed in exactly the contexts DMOJ allowed it, including full-markup statements.

**Translations** work as DMOJ's do: a problem translation is selected by exact language code match with no
fallback chain, so a viewer reading in a language with no translation gets the original statement rather than a
near miss.

## What the importer brings across

`tools/import` reads a `mysqldump` of a DMOJ MariaDB database and writes Convex documents plus Better Auth rows.
It never touches the old site and needs no running MySQL server. Every imported document keeps the old primary
key as `legacyId`, so ids that appeared in URLs stay stable.

Carried across: users with their Django password hashes verbatim, TOTP secrets and scratch codes (decrypted with
the old site's `SECRET_KEY` and re-encrypted the way Better Auth stores them), passkeys, API tokens as a legacy
hash, profiles with points and ratings, organisations and classes with their memberships and join requests,
problems with statements, translations, clarifications, language limits, editorials and test-case configuration,
contests with their formats, problems, labels, access control and participations, submissions with their sources
and per-case results, rating history, comments with their votes and threading, blog posts, tickets, the
navigation bar, the misc config and the flat pages.

Not carried across: Django sessions, registration keys, social logins, Django's own admin log, and the fields
that have no home in the new schema (custom user JavaScript above all). Anything computed, including aggregates,
the sitemap and rendered PDFs, is rebuilt rather than copied.

The first successful sign-in with a legacy `pbkdf2_sha256` hash verifies against it and rewrites it in Better
Auth's format, so nobody is asked to reset a password. See [importing from DMOJ](/admin/import).

## The judge, as a subtree

`apps/judge/judge-server/` is a git subtree of DMOJ's judge-server repository, tracking `master`, so the grader
is upstream code rather than a vendored copy or a fork.

The diff inside the subtree is three files: `dmoj/moj_packet.py`, which is entirely new and implements the pull
protocol; a `MojJudge` subclass and four lines in `dmoj/judge.py` that select it when `MOJ_URL` is set; and
`dmoj/judgeenv.py`, which drops the bridge host positional in that mode, maps dotted problem codes onto nested
directories, and raises the compiler time limit to 60 seconds. Everything else, including the sandbox and every
executor, is upstream.

Because the selection is conditional on `MOJ_URL`, the same image still runs against a DMOJ bridge.

Updating:

```bash
git subtree pull --prefix apps/judge/judge-server https://github.com/dmoj/judge-server.git master --squash
```

Conflicts can only be in `dmoj/judge.py` and `dmoj/judgeenv.py`. Rebuild the image and run
`python3 apps/judge/tests/e2e.py` after every pull.

## API v2 parity

`/api/v2/...` is DMOJ's read API at the same paths, with DMOJ's exact envelope
(`api_version`, `method`, `fetched`, `data` with `objects`, `current_object_count`, `objects_per_page`,
`total_objects`, `page_index`, `total_pages`, `has_more`), DMOJ's `{"error": {"code", "message"}}` failure shape,
DMOJ's basic and list filter names, and DMOJ's capitalised `True` and `False` booleans.

Tokens are 48 characters and are sent as `Authorization: Bearer`. A token minted by the old site keeps verifying
as long as the deployment carries that site's `SECRET_KEY` in `LEGACY_SECRET_KEY`; new tokens come from Better
Auth's API key plugin. Either kind acts as its owner, carrying that account's visibility and its permissions, so
a token belonging to a staff member is a staff credential.

One field type had to widen. DMOJ exposes Django primary keys as integers; MOJ keeps them in `legacyId` for
imported rows and has none for rows created afterwards, so an object id is a number where there is one and a
document id string otherwise. `?id=` filters accept both spellings, and so does `/api/v2/submission/<id>`.

See [the API reference](/reference/api).

## The contest formats

All six of DMOJ's formats are implemented from the same rules, in `packages/core/src/formats/`:
`default`, `ioi` (the legacy ranklist), `ioi16` (IOI 2016 onwards, best score per subtask), `atcoder`, `icpc` and
`ecoo`. Each takes DMOJ's configuration keys with DMOJ's defaults, and reproduces DMOJ's own validation error
messages for a bad configuration.

Two details that are easy to get wrong and are deliberately DMOJ's here: `cumtime` is an integer, because Django
stores it in a `PositiveIntegerField` and truncates; and `points_precision` rounds through the same
half-to-even rule Python uses.

Ratings are Elo-MMR, ported from DMOJ's `judge/ratings.py`. Running both implementations over the same contests
produces the same rating rows, means, performances and ranks.

Contest problem labels follow the format, as DMOJ does: only `icpc` letters its problems, and every other format
numbers them, unless the contest sets an explicit label scheme.

## What differs on purpose

### The judge pulls instead of being pushed

DMOJ runs a bridge daemon on TCP 9999. Judges hold a long-lived socket to it and the site pushes submissions down
that socket, which means the bridge has to be reachable from every judge, and the site has to keep a stateful
process alive next to the web app.

MOJ has no bridge. The judge polls over HTTPS: handshake, heartbeat every ten seconds, a claim every 500
milliseconds while idle, an event per grading packet, and an abort poll once a second while grading. A judge
therefore needs no inbound port, no static address and no certificate of its own, and one behind a home NAT or a
university firewall works exactly like one in the same rack.

The cost is that a claim can wait up to half a second, and that an abort is noticed within a second rather than
instantly. The protocol is documented in `apps/judge/README.md`.

### Reactive pages instead of the event daemon

DMOJ runs a websocket event daemon (`websocket/daemon.js`) and posts events into it so that a submission page,
a contest ranking or the judge status page can update without a reload.

MOJ has no event daemon and no polling anywhere. Pages are Convex queries: a page subscribes, Convex records
which documents the query read, and any write to one of them pushes a new result to every subscriber. Submission
status, test cases arriving one at a time, submission lists, contest rankings, the hall scoreboard, ticket lists,
comment threads and judge status are all live for the same reason, without a second service to run or a second
protocol to secure.

### Typst PDFs instead of pdfoid

DMOJ renders a problem PDF by handing HTML to `pdfoid`, a headless Chromium service, and typesets maths with
`mathoid` or `texoid`. Three sidecar services, each with a queue and a failure mode.

MOJ converts the statement markdown to Typst and runs the `typst` binary. Maths goes through `mitex`, markdown
through `cmarker`, and both packages are vendored under `packages/content/typst/packages` so a compile is
offline. There is no browser in the render path and nothing to keep running: PDF generation is a subprocess that
either produces a document or reports an error onto the job.

### No Lua label scripts

DMOJ lets a contest carry `problem_label_script`, a Lua snippet that computes each problem's label. MOJ has no
Lua runtime. A contest instead has a label scheme (letters, numbers, or an explicit list of custom labels), which
covers what the script was used for.

A contest imported with a label script is given the custom scheme with an empty label list and is named in the
import report, so it can be fixed by hand. Indices past the end of a custom list fall back to letters rather than
rendering an empty header.

### Replaced sidecars

| DMOJ | MOJ |
| --- | --- |
| Django and gunicorn | Next.js App Router on React 19 |
| MySQL or MariaDB through the Django ORM | Convex, self-hosted, with Postgres underneath |
| The bridge daemon on TCP 9999 | The pull protocol over HTTPS |
| The websocket event daemon | Convex subscriptions |
| Celery workers for long tasks | The `jobs` table and the Convex scheduler |
| `pdfoid`, `mathoid`, `texoid` | The Typst binary with vendored packages |
| Redis as broker and cache | Nothing; Convex holds the queue and the aggregates |
| Django auth, with TOTP secrets in Fernet-encrypted columns | Better Auth with Drizzle on Postgres |
| Pygments | Shiki |
| The Django admin | The [staff console](/admin/staff-console) at `/admin` |

The DMOJ judge-server is the one component kept as it is, because it is the part where being different has no
upside and being wrong has a security cost.

### Smaller differences worth knowing

- **Comment ordering.** DMOJ orders every level newest first. MOJ keeps that for top-level comments and orders
  replies oldest first inside a thread, so a conversation reads downwards.
- **Hidden comments** are returned to holders of `judge.change_comment` and flagged, so a hide can be undone from
  the page. DMOJ filters them out for everyone and only offers `unhide` from the Django admin.
- **Judge keys** are stored as their SHA-256 only. DMOJ keeps them in the clear. A key is shown once when it is
  created and cannot be recovered.
- **Disconnecting a judge** is a request the judge picks up at its next heartbeat, since there is no inbound
  socket to send a packet down.
- **Staff two-factor** is enforced on every page rather than only on the removal of a factor. DMOJ's
  `DMOJ_REQUIRE_STAFF_2FA` stops staff disabling their last factor and nothing more.
- **Passkeys are a sign-in path**, not only a second factor after a password.
- **`rel="nofollow"`** survives sanitisation on user content. DMOJ's renderer adds it and DMOJ's sanitiser then
  strips it.
- **The hall scoreboard's reveal** is server-side state shared by every viewer, so the projector, the stream and
  the organiser's laptop turn over the same cell at the same moment. The fork it is modelled on ran the ceremony
  in one browser.
