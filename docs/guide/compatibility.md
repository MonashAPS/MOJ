# Compatibility with DMOJ

MOJ is a rewrite of DMOJ, not a fork. What faces outward is kept, so a site, its problem repositories, its
scripts and its bookmarks move across unchanged.

## The same

| Surface | Detail |
| --- | --- |
| URLs | Every path DMOJ serves is served here, with the trailing slash: `/problems/`, `/problem/aplusb`, `/submissions/user/alice/`, `/submission/12345`, `/contest/spring26/ranking/`, `/user/alice/solved`, `/organization/3-example`, `/accounts/login/`, `/feed/blog/atom/`, `/api/v2/problems`. |
| Problem data | `init.yml`, test layout, batches, dependencies, checkers, graders, generators, interactors, pretests. The grader is the DMOJ judge-server. |
| Statements | DMOJ's markdown, including `~x^2~` inline maths, `[user:name]` links, and raw HTML in the contexts DMOJ allowed it. |
| API v2 | The same paths, envelope, filter names and capitalised `True`/`False` booleans. 48-character bearer tokens. |
| Contest formats | `default`, `ioi`, `ioi16`, `atcoder`, `icpc`, `ecoo`, with DMOJ's configuration keys, defaults and validation messages. |
| Ratings | Elo-MMR, so imported ratings continue rather than restart. |
| Permissions | DMOJ's permission codes verbatim, such as `judge.edit_all_problem` and `judge.rejudge_submission`. |
| Problem labels | Only `icpc` letters its problems; every other format numbers them. |

## What imports

[Importing from DMOJ](/admin/import) reads a `mysqldump` of the old database. Every imported row keeps its old
primary key, so ids that appeared in URLs stay stable.

| Carried across | Left behind |
| --- | --- |
| Users, with their password hashes verbatim | Sessions: everyone signs in again |
| Two-factor secrets and scratch codes, and passkeys | Registration keys: unactivated users get a new mail |
| API tokens, while `LEGACY_SECRET_KEY` is set | Social logins |
| Profiles, points, ratings, organisations, classes | Custom user JavaScript |
| Problems, statements, translations, editorials, limits | Anything computed: aggregates, sitemap, rendered PDFs |
| Submissions with their sources and per-case results | Django bookkeeping: admin log, migrations, redirects |
| Contests, participations, rating history | |
| Comments, blog posts, tickets, navigation, flat pages | |

The first sign-in with a legacy password hash rewrites it in the new format, so nobody is asked to reset
anything.

## What differs

| Behaviour | DMOJ | MOJ |
| --- | --- | --- |
| Judge connection | A bridge daemon pushes work down a held socket on TCP 9999 | The judge polls over HTTPS, so it needs no inbound port |
| Live pages | A websocket event daemon | Pages subscribe; there is no second service to run |
| Problem metadata | Typed into the Django admin | `config.json` in the problem repository |
| Test data | Distributed to each judge out of band | Published to the site, which hands it to judges by hash |
| PDF statements | `pdfoid`, `mathoid` and `texoid` | One binary, with no browser in the render path |
| Contest labels | A per-contest Lua script | A label scheme: letters, numbers, or an explicit list |
| Tilde maths | `~...~` may span a line ending | It may not, so an unbalanced tilde spoils one line |
| Inline `$...$` maths | Not offered | On by default |
| Comment replies | Newest first at every level | Newest first at top level, oldest first inside a thread |
| Hidden comments | Filtered out for everyone | Returned to holders of `judge.change_comment`, flagged |
| Judge keys | Stored in the clear | Stored as a SHA-256; shown once |
| Staff two-factor | Only blocks removing the last factor | Required on every page |
| Passkeys | A second factor | A sign-in path of their own |
| Scoreboard reveal | Runs in one browser | Shared state: every screen turns the same cell over at once |
| Object ids | Always integers | An integer where one was imported, a string otherwise; both are accepted |

A contest imported with a Lua label script is given the custom scheme with an empty label list and is named in
the import report.
