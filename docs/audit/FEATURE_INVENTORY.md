# Feature inventory

What the club's DMOJ actually uses, counted from the production import: 749 users,
313 problems (314 rows in Convex, the extra being the seeded `aplusb`), 63 contests,
14 933 submissions, plus the 386 `init.yml` files rsynced from the judge box.

Counts come from the parsed dump under `tools/import/out/raw/` and from the running
deployment; nothing here reproduces private data beyond problem codes, contest keys
and totals.

Two headline facts before the tables:

- **`halftheproblem` is only solvable in Spanish.** Its English statement is a story
  that stops before the input and output specification; the `es` translation carries
  the actual spec. DMOJ shows it only to a viewer whose `LANGUAGE_CODE` is `es`.
- **`tehran2024` is the only window contest**: `time_limit` 18 000 s (5 h) inside a
  nine-day window.

---

## Problems

| Feature | Count | Codes / values |
| --- | ---: | --- |
| Total | 313 | |
| Not public | 21 | `mcpc23.test`, `lolline`, `asyncantidote`, `v`, `chocolatechompers2`, `dynamicrangeminimumq`, `tasksanddeadlines`, `taskcooldownsched`, `1234567890`, `doubleradars`, `parkingtheory`, `pcb`, `antimissile`, `conferencerides`, `divarsalaries`, `electroattacks`, `gptdarkdown`, `iamsherlocked`, `yalda`, `crossingsails`, `weightdont` |
| Partial scoring | 13 | |
| **Non-partial** | **300** | the default |
| Short circuit | 96 | e.g. `localpeak`, `pondocompare`, `badtrees`, `pokemon`, `mst`, `goblins` |
| Manually managed | 1 | `multiplication` |
| Organisation private | 0 | |
| Banned users on a problem | 0 | |
| Licence set | 0 | `judge_license` is empty |
| `is_full_markup` | 0 | every statement is markdown |
| Points voting | 0 | `judge_problempointsvote` is empty |
| Submission source visibility | 313 × `F` | every problem follows the site setting |
| Problem group | 313 × `uncategorized` | one group, one type |
| Author rows / curators / testers | 218 / 13 / 45 | |
| `date` null in the dump | 176 | imported as `0` |
| `og_image`, `summary` | 0 / 0 | |

### Translations

Two rows, both `es`.

| Problem | English statement | `es` translation |
| --- | --- | --- |
| `halftheproblem` | 1 044 chars, story only, **no input/output spec** | 1 044 → 779 chars, "The other half of the problem", carries the spec |
| `1234567890` | 59-char stub, not public | 19-char stub |

No statement anywhere contains Arabic, Cyrillic, CJK, Hebrew, Greek or any other
non-Latin script, and none carries accented Spanish. The "Spanish" content in
`halftheproblem` is English prose about a Spanish story, tagged `es`.

### Allowed languages and limits

- 59 languages on the site.
- **One** problem restricts them: `1234567890`, allowed `["CPP20"]` only. The other
  312 allow all 59.
- Per-language limits: 240 rows across **120 problems** (`languageLimits`).
- Problem `time_limit` values in use: 0.2, 0.5, 1 (203 problems), 1.5, 2 (69), 2.5,
  3, 4, 5 (16), 8, 10, 12 seconds.
- Memory limits range 131 072 KB – 1 048 576 KB.

### Statement markup

| Construct | Problems | Notes |
| --- | ---: | --- |
| `~ ... ~` tilde math | 280 | DMOJ's default math delimiter |
| Markdown headings | 291 | |
| Fenced code blocks | 288 | |
| `$ ... $` math | 2 | `goatiii`, `5bigbooms` — likely accidental |
| `\(` / `\[` math | 1 | `gptdarkdown` |
| Markdown tables | 1 | `humptydumpty` |
| Markdown images | 19 | |
| Raw `<img>` | 7 | `permutationpuzzle`, `meowmeow`, `tiltedtowers`, `foodyunclemike`, `pickyeater`, `stageoneconfusion`, `crossingsails` |
| HTML comments | 6 | `feedamole`, `goatii`, `anthill`, `sensorblocking`, `funnybits`, `meowmeow` |
| `<iframe>`, `<latex>`, `<script>`, `<style>`, `<details>`, `\|\|\|spoiler`, `data:` URIs | 0 | none used |

### `/media` images

**30 distinct `/media/martor/<uuid>.{png,jpg}` URLs** across 21 problems and one
editorial. All 30 resolve to files in `infra/media/` (69 files there in total).

Referencing problems: `ttc`, `mirrorimages`, `blockpathing`, `cuttingboard1`,
`cuttingboard2`, `divisors3`, `berniecake`, `anthill`, `itsybitsyspider`,
`identifiedassassins`, `primecut`, `sushi1`, `tiltedtowers`, `primecut4`,
`idiotsandwich`, `qrcode`, `foodyunclemike`, `pickyeater`, `stageoneconfusion`,
`antimissile`, `crossingsails`.

### Editorials, clarifications, tickets, comments

| Table | Count | Notes |
| --- | ---: | --- |
| `solutions` (editorials) | 95 | 4 private: `goatiii`, `factorfusion`, `tasksanddeadlines`, `suffering` |
| — scheduled in the future | 0 | every `publish_on` is in the past |
| — with authors | 18 rows | |
| `problemClarifications` | 1 | `gidiup` |
| `tickets` | 12 | all `linkedType: "problem"`, 2 still open, 21 messages, 23 assignee rows |
| — problems ticketed | 10 | `pondoexponentiation` (×3), `methodicalrocket` (×2), `allblue`, `problemlikelihood`, `bigbucket`, `formula`, `coconut`, `interestingwords`, `lightsperfectvictory` |
| `comments` | 18 | 14 on contests, 4 on problems; 2 hidden, 4 replies, 7 votes |
| — orphaned targets | 2 | both on contest key `beginner24`, which no longer exists |

---

## `init.yml` (386 files across 7 repositories)

Only six top-level keys appear in the whole corpus.

| Key | Files |
| --- | ---: |
| `test_cases` | 386 |
| `checker` | 35 |
| `extra_num_for_bump` | 28 |
| `custom_judge` | 13 |
| `unbuffered` | 4 |
| `time_limit` | 1 |

`extra_num_for_bump` is not a DMOJ key — it is the club's way of forcing the judge
to re-read a problem. `dmoj/problem.py` ignores it.

### Checkers (35 files)

| Checker | Files | Examples |
| --- | ---: | --- |
| `checker.py` (custom) | 19 | `dsless-23/divisors3`, `mcpc-problems/anthill`, `mcpc-problems/pickyeater`, `mcpc23/rainbowsheep`, `mcpc25/potionseller` |
| `floatsabs` with `args.precision` | 10 | precision 2, 3 and 6 — `5bigbooms`, `ezpz`, `plottwist`, `primecut`, `primecut3`, `sweepline`, `vectorcalculator`, `D_and_Q`, `dandq`, `vectorCalculator` |
| `floats` | 4 | 2 bare (`misc3`, `blockpathing`), 2 with `precision` (`fracsack`, `primecut4`) |
| `standard` | 2 | `bipartitecheck`, `pathrestore` |
| `bridged` | 0 | not used |
| per-test-case `checker` | 0 | not used |

Every custom `checker.py` exports `def check(process_output, judge_output, **kwargs)`;
9 of them import `dmoj.result.CheckerResult`.

### Custom graders (13 files, all `custom_judge: grader.py`)

| Kind | Files |
| --- | --- |
| `InteractiveGrader` | `guessnumber`, `localpeak`, `memorymatch`, `miserebusiness`, `searcharray`, `jackandjill` |
| `StandardGrader` subclass | `cardtrick`, `diabolicaldefuser`, `warden` |
| Bare `test_res`/`run_with_values` script | `coins1`, `coins2`, `coins3`, `kthsmallest` |

`unbuffered: true` on `coins1`, `coins2`, `coins3`, `kthsmallest`.
`signature_grader` / `interactive` as init.yml keys: **not used** (interaction is
done through `custom_judge`).

### Test cases

Across all 386 files the only test-case keys are `points`, `in`, `out` and `batched`
(whose entries carry only `in`/`out`).

| Feature | Uses |
| --- | ---: |
| `batched` with sub-cases | 525 batches over 272 problems |
| `dependencies` | 0 |
| `points: null` | 0 |
| `is_pretest` | 0 |
| `generator` | 0 |
| `output_limit_length` / `output_prefix_length` | 0 |
| `archive` / zip data | 0 (test data is extracted on disk) |
| `hints` (`unicode`, `nobigmath`) | 0 |
| `file_io` | 0 |
| `time_limit` override | 1 — `mcpc-problems/taskcooldownsched`, 5 s |

The DB's own `judge_problemdata` has 25 rows and is nearly empty: one `checker:
standard` (`berniecake`, also the only `zipfile`), one `feedback` string
(`coconut`), no generators, no output limits, no `unicode`/`nobigmath` hints.
`judge_problemtestcase` has 4 rows. The judge box's `init.yml` files are the real
source of truth.

---

## Contests (63)

| Feature | Value |
| --- | --- |
| `format_name` | **`default` × 63** — no `icpc`, `ioi`, `ioi16`, `atcoder` or `ecoo` contest exists |
| `format_config` | `null` × 63 |
| `problem_label_script` (Lua) | **none** — no contest carries one |
| `points_precision` | 3 × 63 (DMOJ's default) |
| `scoreboard_visibility` | `V` × 63 — no `C`, `P` or `H` contest exists |
| `run_pretests_only` | 0 |
| `is_private` / `is_organization_private` | 0 / 0 |
| `access_code` | 0 |
| Class restricted | 0 (`judge_class` is empty) |
| `hide_problem_tags` | 3 — `2023dsless`, `2024s1beginner`, `mcpc24` |
| `hide_problem_authors` | 0 |
| `show_short_display` | 0 |
| `limit_join_organizations` | 0 |
| `logo_override_image`, `og_image` | 0 / 0 |
| `summary` | 1 |
| Not visible | 1 — `123` |
| `use_clarifications` | 60 |

### Window contests (`time_limit`)

**One:** `tehran2024`, `time_limit` 18 000 s (5 h), window
2026-08-21 08:18 → 2026-08-30 08:18 UTC (about nine days). It has a single
participation, `virtual = 1`, whose window is `real_start + 5 h`.

### Rated contests

| Key | `rate_all` | floor | ceiling | excluded |
| --- | --- | --- | --- | ---: |
| `2023mcpc` | yes | — | — | 0 |
| `2023dsless` | no | — | — | 0 |
| `2024s1beginner` | yes | — | — | 0 |
| `2024s2beginner` | no | — | — | 0 |
| `mcpc24` | yes | — | — | 0 |
| `2025s1beginner` | no | — | — | 0 |

No `rating_floor`, no `rating_ceiling`, no `performance_ceiling_override`, no
`rate_exclude` rows. **`judge_rating` is empty and every `judge_profile.rating` is
null** — the club never ran a rating pass, so there are no stored rating rows to
reproduce.

### Locked contests (`locked_after`)

| Key | Locked after | Submissions | Carrying `locked_after` |
| --- | --- | ---: | ---: |
| `2024s1w7` | 2024-04-18 09:00 | 33 | 25 |
| `2024s1w10` | 2025-05-09 04:18 | 24 | 18 |
| `geointro2025` | 2025-08-27 08:20 | 22 | 19 |

The gap is faithful: DMOJ stamps `Submission.locked_after` at submission time, so
submissions made before the lock was configured have none. The dump has 62 stamped
submissions in total and so does the import.

### People on contests

| Role | Rows | Contests |
| --- | ---: | --- |
| Authors | 87 | all 63 |
| Curators | 8 | `2024s1beginner`, `2024s1w10`, `sample`, `2025s1beginner` (5) |
| Testers | 34 | 9 contests; `tester_see_scoreboard` on `2023mcpc`, `geointro2025`, `2026s1w5`; `tester_see_submissions` on `2023mcpc`, `geointro2025` |
| Spectators | 1 | `2025s1beginner` |
| Banned | 1 | `2025s1w9` |
| `view_contest_scoreboard` / `view_contest_submissions` | 0 / 0 | |
| Organisations / classes / private contestants | 0 / 0 / 0 | |
| Tags | 0 (`judge_contesttag` empty) | |

### Contest problems and participations

| Table | Count | Notes |
| --- | ---: | --- |
| `contestProblems` | 399 | `is_pretested` 0, `max_submissions` 0, `output_prefix_override` all null; `partial` on 225 |
| `contestParticipations` | 1 533 | live 1 293, spectating (`virtual = -1`) 27, virtual 213 (v1 177, v2 26, v3 9, v4 1) |
| — disqualified | 1 | one live participation in `2025s1w9`, stored `score = -9999` |
| — non-zero `tiebreaker` | 0 | `default` never sets one |
| — with `format_data` | 1 105 | 428 have none |
| `contestSubmissions` | 11 869 | `is_pretest` 0 |
| `contestMoss` | 0 | |

---

## Submissions

| Field | Distribution |
| --- | --- |
| Total | 14 933 (11 869 in a contest) |
| `status` | D 14 011, CE 526, AB 278, IE 118 |
| `result` | WA 5 978, AC 4 481, IR 1 733, TLE 1 433, CE 526, RTE 290, AB 278, IE 118, MLE 83, OLE 10, SC 3 |
| `is_pretested` | 0 |
| Rejudged | 708 |
| Top languages | PY3 8 119, CPP20 2 540, PYPY3 2 055, CPP17 980, CPP11 657, CPP14 204, C 81, V8JS 71, RUST 64, JAVA8 50 |

---

## Site

### Navigation bar (6 rows, one nested)

| Key | Label | Path | Regex | Parent |
| --- | --- | --- | --- | --- |
| `problems` | Problems | `/problems/` | `^/problem` | — |
| `submit` | Submissions | `/submissions/` | `^/submi\|^/src/` | — |
| `user` | Users | `/users/` | `^/user` | — |
| `contest` | Contests | `/contests/` | `^/contest` | — |
| `about` | About | `/about/` | `^/about/$` | — |
| `status` | Status | `/status/` | `^/status/$\|^/judge/` | **`about`** |

`status` is a *child* of `about` in the MPTT tree — the only nested item, and the
only pair of regexes with alternation.

### Everything else

| Table | Rows | Notes |
| --- | ---: | --- |
| `judge_miscconfig` | 0 | the deployment's 5 rows are MOJ seed values |
| `django_flatpage` | 0 | the deployment's `/about/` page is a seed |
| `judge_license` | 0 | |
| `judge_organization` | 1 | `official`, 1 admin, 21 membership rows, no access code |
| `judge_class` | 0 | |
| `judge_blogpost` | 0 | the deployment's 2 posts are seeds |
| `judge_commentlock` | 0 | |
| `django_site` | 1 | `judge.monashaps.com` |

### Profiles (747 imported, 749 in the deployment)

| Field | Value |
| --- | --- |
| `display_rank` | `user` × 747 (the deployment has one `admin`, the seeded account) |
| `mute` | 0 |
| `is_unlisted` | 0 |
| `is_banned_from_problem_voting` | 0 |
| `rating` | null × 747 |
| `user_script` | empty × 747 — the importer records it as an unmapped column |
| `is_totp_enabled` | 0 |
| Non-zero `points` / `problem_count` | 380 |
| Timezones | Australia/Melbourne 366, Australia/Sydney 222, Australia/Victoria 80, Europe/Moscow 52, Asia/Kuala_Lumpur 6, Australia/Perth 4 |
| Default submission language | PY3 606, and 5 others |
