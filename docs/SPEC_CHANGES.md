# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

- 2026-09-10 (packages/core): the contest format `displayUserProblem` and `displayParticipationResult`
  return structured cell data (`state`, `points`, `pointsText`, `timeText`, `penalty`, `bonus`) instead of
  DMOJ's HTML `<td>` fragments. `packages/core` is pure domain logic and the tables are React; the fields
  carry exactly what DMOJ's markup carried, including the `pretest-` state prefix.
- 2026-09-10 (packages/core): SPEC section 7 says an ICPC rejected submission is "any non-AC result except
  CE, IE and AB". That is the MAPS fork's hall-scoreboard rule (`IGNORED_RESULTS = {IE, CE, AB}` in
  judge/utils/frozen_scoreboard.py) but not DMOJ's `icpc` contest format, which ignores only IE, CE and
  submissions with no result at all, so an aborted submission does add a penalty on the contest ranking
  page. Both behaviours are ported as they stand: `formats/icpc.ts` follows DMOJ, `scoreboard.ts` follows
  the fork. Flagged so a decision can be made deliberately if the two should be unified.
- 2026-09-10 (packages/core): `updateParticipation` takes the contest row as well as the participation,
  submissions and contest problems. The formats need `points_precision`, the participation start (which is
  derived from the contest) and, for `ecoo`, the participation end time.
- 2026-09-10 (packages/core): the schema has no field for "staff have revealed the frozen board", so
  `applyFreeze`/`isFrozenFor` take a `revealed` flag from the caller. If the reveal is to survive a page
  reload it needs a column (or a `scoreboardEvents` entry) in a later branch.
- 2026-09-10 (packages/core): with `labelScheme: "custom"`, indices past the end of `customLabels` fall
  back to letters rather than rendering an empty header.
- 2026-09-10 (packages/core): `@moj/core` has no runtime dependencies at all (zod was permitted but not
  needed; contest format config validation reproduces DMOJ's own error messages).
