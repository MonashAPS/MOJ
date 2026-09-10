# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

## 2026-09-10, apps/judge

Section 6 names the judge API endpoints and payloads but leaves some details open. These are the choices the
judge now makes; `convex/http.ts` has to match them, and `apps/judge/README.md` documents them for operators.

- `POST /judge/event` discriminates the event on a `type` field inside `event`, so the body is
  `{judgeName, judgeKey, submissionId, event: {type, ...payload}}`. The type strings are exactly the names
  the spec lists (`grading-begin`, `batch-begin`, `batch-end`, `test-case-status`, `grading-end`,
  `compile-error`, `compile-message`, `internal-error`, `submission-terminated`).
- `GET /judge/abort` carries `judgeName` and `judgeKey` in the query string alongside `submissionId`, since
  it has no body to put them in.
- Test case objects use camelCase like the rest of the API: `totalPoints`, `extendedFeedback`. They also
  carry `voluntaryContextSwitches`, `involuntaryContextSwitches` and `runtimeVersion`, which DMOJ's bridge
  records in its json log; store or ignore them, but the schema should accept them.
- The claim response's `meta` is camelCase (`pretestsOnly`, `inContest`, `attemptNo`, `user`, `userNotes`)
  as the spec says. The judge translates it to DMOJ's dashed keys before handing it to the grader, so
  problem `init.yml` files that read `meta.user` or `meta['in-contest']` keep working.
- The spec puts the judge's problem list on `/judge/heartbeat` as an optional `problems`, so the judge sends
  problem set changes there rather than inventing an event type. Runtime changes go the same way as an
  optional `executors`. There is no ping event: in a pull protocol load reaches the site on the heartbeat.
- Every DMOJ compiled executor reports its compiler output before grading starts, even when that output is
  empty, so a `compile-message` with an empty `log` is routine. Do not surface it as a compiler warning.
- The judge container renders `/problems/judge.yml` on first start, which lands in `infra/problems/` for a
  compose stack using the volume from section 14. That path should be gitignored alongside the rest of the
  pulled problem data.
