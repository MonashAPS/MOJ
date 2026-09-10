# Spec changes

Append dated bullets when you had to extend or deviate from docs/SPEC.md.

## 2026-09-10, tools/import

- `convex/importer.ts` also exports an internal mutation `patchBatch({table, patches})`. Section 15 lists
  `insertBatch`, `clearTable` and `mapping`, but `profiles.currentParticipationId` points forward at a
  `contestParticipations` document, so the importer inserts profiles first and patches that one field after the
  participations are in. `patchBatch` is used for nothing else.
- Import order deviates from section 15 in two places, both because of references the spec's order does not allow:
  `contestTags` is imported before `contests` (a contest holds `tagIds`), and `blogPosts` is imported before
  `comments` (a comment on a blog post holds the post's id in `targetKey`).
- `comments.targetKey` and `commentLocks.targetKey` hold the Convex `_id` of the blog post for `targetType: "blog"`,
  not DMOJ's numeric post id. Problems, contests and solutions keep their natural key (code or contest key).
- DMOJ's `judge_contest.problem_label_script` (a Lua snippet) has no equivalent in the schema's
  `labelScheme`/`customLabels`. A contest with a script is imported with `labelScheme: "custom"` and empty
  `customLabels`, and is listed in the import report.
- `judge_problem.date` is nullable in DMOJ but `problems.date` is required. Null becomes 0, and every such problem
  is listed in the import report.
