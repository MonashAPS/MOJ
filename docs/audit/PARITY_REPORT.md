# Parity report

One line per DMOJ feature the club's data actually uses. Usage counts come from
`docs/audit/FEATURE_INVENTORY.md`. Status is one of:

- **verified** — the field imports correctly, the query exposes it and the logic is
  DMOJ's; checked against the data or a test.
- **fixed here** — was wrong on this branch; the commit is named.
- **needs page work** — the backend is right and nothing renders it yet; the item is
  written up in `docs/audit/PAGE_REQUIREMENTS.md`.
- **not reproducible** — with the reason.

`REPL` below means a read-only query run against the deployment holding the
production import (`npx convex run` / the Convex REPL).

---

## Problems

| Feature | Used by | Status | Evidence |
| --- | --- | --- | --- |
| Translations, DMOJ's exact-match rule | 2 problems, both `es` | **verified** (backend) + **fixed here** (viewer language) | `convex/problems.ts:313` `translationFor` is `translations.get(language=LANGUAGE_CODE)` with no fallback chain. `npx convex run problems:pdfSource '{"code":"halftheproblem","language":"es"}'` returns the 779-char `es` statement; `en` and `fr` both return the 1 044-char original. |
| Language switcher drives that selection | site-wide | **fixed here** | Was a `moj-language` cookie written in `Footer.tsx` and read nowhere, offering 4 languages, not including `es`. `43fca123` reads it in the layout, passes it to the shell and `<html lang>`, and offers `settings.LANGUAGES`. Checked on a dev server: `curl -b moj-language=es /` renders `<html lang="es">`. |
| Statement `/media/...` images | 30 URLs, 21 problems + 1 editorial | **fixed here** | No route existed for `/media/...`; every image 404ed. `7727f0ba` adds `apps/web/src/app/media/[...path]/route.ts`. All 30 URLs resolve to files in `infra/media/`. Dev server: PNG → 200 `image/png` 30 886 B, JPG → 200 `image/jpeg`, missing → 404, `..` and `%2F..%2F` → 404. Tests in `apps/web/src/lib/media.test.ts`. |
| Allowed-language subsets | 1 (`1234567890`, `CPP20` only) | **verified** | REPL: `allowedLanguageIds.length === 1`, key `CPP20`; the other 312 carry all 59. `problems.get` returns `showLanguages` from the same comparison DMOJ makes (`allowed_languages.count() != Language.objects.count()`). |
| Per-language time/memory limits | 240 rows, 120 problems | **verified** | REPL: `languageLimits` 240 rows over 120 problems; `convex/problems.ts:781` joins them into `languageLimits` on the detail payload. |
| Non-partial problems | 300 | **verified** | REPL count; `partial` is a plain boolean on `problems` and feeds `bestSolutionState`. |
| Short circuit | 96 | **verified** | REPL count matches the dump. Read only by the judge (`dmoj/problem.py`), which MOJ does not touch. |
| Manually managed | 1 (`multiplication`) | **verified** | REPL: `isManuallyManaged: true`. |
| Submission source visibility | 313 × `F` | **fixed here** | `F` means "follow `DMOJ_SUBMISSION_SOURCE_VISIBILITY`", so the site setting is the only thing deciding source access. Neither `submissions.source` nor the v2 API passed it, so the setting was inert. `ee9bc595` threads it through; `convex/sourceVisibility.test.ts` fails without the fix. |
| Organisation-private problems | 0 | **verified** (unused) | `problemIsVisibleTo` implements it (`packages/core/src/permissions.ts:181`); no data exercises it. |
| Banned users on a problem | 0 | **verified** (unused) | `packages/core/src/permissions.ts:278`, `convex/problems.ts:902`. |
| Points voting | 0 | **verified** (unused) | Table imported and empty; `votePermissionForUser` exists. |
| Licences | 0 | **verified** (unused) | `judge_license` empty; schema and import path exist. |
| Full-markup (raw HTML) statements | 0 | **verified** (unused) | `is_full_markup` false on all 313; `problems.get` still picks the `problem-full` preset when set. |
| Editorials, private and scheduled | 95, 4 private, 0 scheduled | **needs page work** | `solutions` imported with `isPublic`/`publishOn`; `solutionIsAccessibleBy` implements DMOJ's rule. No editorial page renders it. |
| Problem clarifications | 1 (`gidiup`) | **needs page work** | `convex/problems.ts` exposes `clarifications`; no problem page consumes it. |
| Tickets linked to problems | 12, all `problem` | **verified** | REPL: every `linkedKey` resolves to a real problem code; `convex/tickets.ts:73` `linkedProblem` drives visibility, and `tickets.test.ts` covers it. Rendering is page work. |
| Comments on problems | 4 | **verified** | REPL: all 4 `targetKey`s resolve. |

## init.yml / judge

The judge reads `init.yml`; MOJ never parses it at runtime, so none of these can
interfere with the site. Verified by inspection of `apps/judge/judge-server/dmoj/problem.py`.

| Feature | Used by | Status | Evidence |
| --- | --- | --- | --- |
| Custom `checker.py` | 19 problems | **verified** (judge only) | Every one exports `check(process_output, judge_output, **kwargs)`; supported by `dmoj/checkers/bridged.py` / the custom-checker path. |
| Built-in checkers with args | 16 (`floatsabs` 10, `floats` 4, `standard` 2) | **verified** (judge only) | `dmoj/checkers/floatsabs.py`, `floats.py`, `standard.py` all present in the vendored judge. |
| `custom_judge: grader.py` | 13 problems | **verified** (judge only) | 6 `InteractiveGrader`, 3 `StandardGrader` subclasses, 4 bare scripts. `dmoj/graders/interactive.py` and `standard.py` present. |
| `unbuffered` | 4 problems | **verified** (judge only) | Read by `dmoj/problem.py`. |
| `time_limit` override | 1 (`taskcooldownsched`) | **verified** (judge only) | |
| `batched` test cases | 525 batches, 272 problems | **verified** | The batch verdict path lives in `packages/core/src/formats/ioi16.ts` and `convex/judging.ts`; the judge emits batches over the judge API. |
| `bridged`, `dependencies`, `points: null`, pretests, `generator`, `output_limit_length`, `output_prefix_length`, `hints`, `signature_grader`, `interactive`, `file_io`, `archive` | 0 | **verified** (unused) | Not present in any of the 386 files. |
| `extra_num_for_bump` | 28 files | not a DMOJ key | Ignored by `dmoj/problem.py`; a local convention for forcing a re-read. |

## Contests

| Feature | Used by | Status | Evidence |
| --- | --- | --- | --- |
| `default` format arithmetic | all 63 contests, 1 533 participations | **verified** | Recomputed every imported participation through `@moj/core`'s `updateParticipation` against the raw dump: **score matches exactly for all 1 533** (max diff 0), cumtime matches exactly once truncated, and `format_data` matches for 1 529. The 4 that differ are stale DMOJ rows (a contest submission exists that `update_participation` never saw), not an arithmetic difference. |
| `cumtime` as an integer | 982 of 1 533 participations affected | **fixed here** | DMOJ's `cumtime` is a `PositiveIntegerField`, so Django's `int()` truncates. MOJ kept the float. `4adc818a` truncates in every format; `packages/core/tests/formats.test.ts` covers it. |
| `format_data` keys | 1 105 participations, 3 850 cells | **fixed here** | DMOJ keys by `ContestProblem.id`; the import copied the numbers through, so `formatData[contestProblem.id]` resolved to nothing and every scoreboard cell would render blank. `66bff014` rekeys on import, `5606a120` backfills an existing deployment. After running it: REPL reports 0 numeric keys, 1 105 with Convex ids, **3 850 cells resolved, 0 unresolved**. |
| The other five formats (`ioi`, `ioi16`, `icpc`, `atcoder`, `ecoo`) | 0 contests | **verified** (unused) | All six implemented in `packages/core/src/formats/` and covered by `packages/core/tests/formats.test.ts` (208 tests). Nothing in the club's data exercises them. |
| Problem labels | all 63 | **fixed here** | DMOJ has no label column: with no `problem_label_script` the format class decides, and only `icpc` letters its problems — `DefaultContestFormat.get_label_for_problem` returns `str(index + 1)`. The import wrote `"letters"` for every contest, so all 63 would have shown A, B, C where the old site showed 1, 2, 3. `66bff014` takes the scheme from the format on import; `8903f096` backfills an existing deployment. After running it, `npx convex run contests:get '{"key":"tehran2024"}'` labels its eleven problems 1 to 11. |
| Lua `problem_label_script` | **0 contests** | **verified** (unused) | Confirmed against `judge_contest.problem_label_script`: every row is empty. There is no Lua runtime in MOJ and none is needed. The import maps a script to `labelScheme: "custom"` and warns; no mapping was required for this data. |
| Window contests (`time_limit`) | 1 (`tehran2024`, 18 000 s) | **verified** | `participationEndTime` (`packages/core/src/contestTiming.ts:74`) is `contest.py:566` line for line, including the asymmetry between the virtual branch's truthiness test and the live branch's `is None`. REPL on `tehran2024`: `timeLimit` 18 000, the one `virtual = 1` participation gets a 5-hour window inside a nine-day contest. `contests.get` returns `timeLimit`, `endsAt`, `timeRemaining`; `contests.join` routes through `contestJoinDecision`, which reads it. Countdown and ranking are page work. |
| Scoreboard visibility V/C/P/H | 63 × `V` | **verified** (only `V` used) | `contestShowScoreboard`, `contestCanSeeFullScoreboard`, `contestCanSeeOwnScoreboard` in `packages/core/src/permissions.ts:305-413` are `contest.py:227/236/263`; called from `convex/contestRankings.ts:176` and `convex/contests.ts:1219`. No `C`, `P` or `H` contest exists to exercise. |
| `hide_problem_tags` | 3 contests | **verified** | `convex/problems.ts:806` `hideTags = viewer.inContest && viewer.contest?.hideProblemTags`, `types: null` at `:951`. Rendering is page work. |
| `hide_problem_authors` | 0 | **verified** (unused) | Same block, `:807` and `:961`. |
| `run_pretests_only` | 0 | **verified** (unused) | `convex/judging.ts:798` and `packages/core/src/formats/base.ts:243` (the `pretest-` cell class). |
| Access codes | 0 | **verified** (unused) | `contestJoinDecision` demands one only when a *new* participation would be created, as DMOJ does; `convex/contests.ts:1307` throws `accessCodeRequired`. Never returned to the client. |
| Private / organisation-private / class-restricted contests | 0 / 0 / 0 | **verified** (unused) | `contestAccessCheck` (`permissions.ts:434`) implements the full four-way matrix including the both-flags case. |
| Rated contests | 6 | **verified** | `@moj/core`'s Elo-MMR reproduces `judge/ratings.py` exactly: running both implementations over the six rated contests in end-time order gave **236 rating rows each, 0 mismatched, max \|Δrating\| = 0, max \|Δmean\| = 8.2e-12, max \|Δperformance\| = 1.3e-11, max \|Δrank\| = 0**. The Convex driver is covered by `convex/__tests__/contestsRanking.test.ts`. |
| Reproducing the *stored* rating rows | — | **not reproducible** | `judge_rating` is empty in the dump and every `judge_profile.rating` is null: the club never ran a rating pass, so there is no baseline to diff against. The cross-check above against DMOJ's own code is the substitute. |
| `rate_all` | 3 contests | **verified** | `rateContest` (`packages/core/src/ratings.ts:304`) drops zero-submission participations only when `rateAll` is false, and the cross-check exercised both. |
| Rating floors / ceilings / `rate_exclude` | 0 / 0 / 0 | **verified** (unused) | Filters implemented in the same function. |
| `locked_after` | 3 contests, 62 submissions | **verified** | REPL: 25/33, 18/24, 19/22 submissions carry `lockedAfter`, and the dump has exactly the same 62 — DMOJ stamps it at submission time, so earlier submissions legitimately have none. `isLocked` (`packages/core/src/verdicts.ts:119`) gates rejudge and edit at `convex/submissions.ts:940`, `convex/jobs.ts:168`, `convex/admin/submissions.ts:50`. |
| Testers, `tester_see_scoreboard`, `tester_see_submissions` | 34 rows / 3 / 2 contests | **verified** | REPL matches the dump per contest. Honoured in `contestCanSeeFullScoreboard` and `canSeeSubmissionDetail`. |
| Spectators | 1 contest | **verified** | REPL: `2025s1beginner`. `contestIsSpectatableBy`, and the spectate branch of `participationEndTime`. |
| Curators | 4 contests, 8 rows | **verified** | REPL matches. |
| Banned users on a contest | 1 (`2025s1w9`) | **verified** | REPL. `contestJoinDecision` returns `banned` unless superuser. |
| Disqualifications | 1 participation | **verified** | REPL: stored `score = -9999`, `cumtime = 0`; `updateParticipation` (`formats/index.ts:26`) reproduces exactly that. |
| Virtual participations | 213 (v1 177, v2 26, v3 9, v4 1) | **verified** | REPL. `contestJoinDecision` picks `max(highest + 1, 1)`. |
| Spectating participations | 27 (`virtual = -1`) | **verified** | REPL. |
| `points_precision` | 63 × 3 | **verified** | `pointsPrecision` used by `pyRound` in every format. |
| Contest tags | 0 | **verified** (unused) | `contestTags` table imported and empty. |
| Contest clarifications | 60 contests allow them | **needs page work** | `convex/contests.ts:1661` `clarifications` and `:1700` `addClarification` exist; no page. |
| MOSS | 0 rows | **verified** (unused) | `contestMoss` table and `convex/contests.ts:1906`. |
| Comments on contests | 14 | **verified**, 2 orphaned | REPL: 12 resolve; 2 point at contest key `beginner24`, which was deleted on the old site too. `loadCommentTarget` returns `exists: false` and `comments.list` returns `null` — the same dead end DMOJ had. |

## Site

| Feature | Used by | Status | Evidence |
| --- | --- | --- | --- |
| Navigation bar, custom paths and regexes | 6 items, one nested (`status` under `about`) | **verified** | REPL: all 6 imported with `path`, `regex` and `parentId`, including the alternation regexes `^/submi\|^/src/` and `^/status/$\|^/judge/`. The deployment adds two seeded items (`organizations`, `runtimes`). Whether the nav *uses* the regex to mark the active item is page work. |
| Misc config | 0 imported | **verified** (unused) | `judge_miscconfig` is empty; the deployment's 5 rows are MOJ seed values. |
| Flat pages | 0 imported | **verified** (unused) | `django_flatpage` empty; `/about/` in the deployment is a seed and renders. |
| Licences | 0 | **verified** (unused) | |
| Display ranks | 747 × `user` | **verified** | REPL. Used for `getUserCssClass` (`packages/core/src/ratings.ts:423`) and carried on every author/viewer payload; never a permission check, as in DMOJ. |
| Muted users | 0 | **verified** (unused) | Enforced at `convex/comments.ts:406/459/484`, `convex/tickets.ts:325/409`, `convex/profiles.ts:748/979`. |
| Unlisted users | 0 | **verified** (unused) | Excluded from every ranking, aggregate, search and feed — `convex/rankings.ts:99/174`, `convex/lib/aggregates.ts:11/21/31`, `convex/search.ts:30`, `convex/feeds.ts:228`, `convex/apiV2.ts:718`. |
| User scripts | 0 | **not reproducible** (unused) | `judge_profile.user_script` is empty for all 747 and MOJ has no schema field; the import records it as an unmapped column. Nothing to reproduce. Adding it would mean running arbitrary user JS. |
| Organisations | 1 (`official`), 21 memberships | **verified** | REPL. |
| Classes | 0 | **verified** (unused) | `judge_class` empty. |
| Blog posts | 0 imported | **verified** (unused) | |
| Comment locks | 0 | **verified** (unused) | |

## Notes on things that are correct but easy to get wrong later

- `convex/problems.ts:322` and `convex/admin/contests.ts:305` each re-implement the
  contest label rule instead of calling `getContestLabelForProblem` from
  `@moj/core`, and their `custom`-scheme fallbacks differ slightly from the core
  one. Harmless for this data (no contest uses `custom`), but it is three copies of
  one rule.
- `convex/contestRankings.ranking` does not return `timeLimit` in its contest block,
  unlike `contests.get` and `contests.list`. A ranking page that wants per-participant
  remaining time needs the field added or a second query.
- `convex/scoreboard.ts:456` deliberately ignores `scoreboardVisibility` for the
  public hall board. No private contest exists, so nothing leaks today.
- The test-data editor (`convex/problemData.ts`) refuses a manually managed problem,
  which is DMOJ's guard exactly (`views/problem_data.py:108`). Only
  `multiplication` carries the flag, so for the other 312 the editor opens and a save
  would replace the hand written `init.yml` the judge box holds. That is true of the
  club's DMOJ as well, so it is parity rather than a regression, but it is worth
  knowing before anyone uses the page.
