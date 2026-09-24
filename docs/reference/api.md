# API

| API | Base | Purpose |
| --- | --- | --- |
| API v2 | `https://judge.example.org/api/v2/` | DMOJ's read API, at the same URLs with the same envelope and filters. |
| Problems API | `https://judge.example.org/api/problems/` | Publishing statements, metadata and test data. |
| Judge API | The `convex-site.` origin, under `/judge/` | Spoken by judge containers only. |

Make a token at `/accounts/api/token/generate/` or `/admin/api-keys/`; see
[accounts](/using/accounts#api-tokens).

## Authentication

```
Authorization: Bearer <token>
```

API v2 requires exactly `Bearer ` followed by 48 characters from `A-Za-z0-9_-`, and does not check scopes; a
request with no header is served as a signed-out visitor. A malformed header is `400 Invalid authorization
header` and an unknown, revoked or banned token is `401 Invalid token` with
`WWW-Authenticate: Bearer realm="API"`, both plain text rather than the envelope. The problems API requires the
`problems:write` scope on every endpoint.

A token acts as its owner, carrying that account's visibility and permissions, so a staff member's token is a
staff credential. A token minted by an imported DMOJ site keeps verifying while `LEGACY_SECRET_KEY` is set, on
API v2 only. Neither API is rate limited.

## Envelope

```json
{
  "api_version": "2.0",
  "method": "get",
  "fetched": "2026-09-11T04:21:08.135Z",
  "data": {}
}
```

Exactly one of `data` and `error` is present. A single object is `{"data": {"object": {}}}`; a list carries
`objects` alongside `current_object_count`, `objects_per_page`, `page_index`, `has_more`, `total_objects` and
`total_pages`.

Pages are one-indexed and selected with `?page=`. Page size is fixed at 1000; read `objects_per_page` rather than
assuming it. A page past the end is an empty `objects` array. A list endpoint scans at most 20,000 rows per
request and leaves `has_more` true rather than lying about the end; `/api/v2/submissions` filtered by a basic
filter also omits `total_objects` and `total_pages`, because the count is not known without walking the table.

An error's HTTP status is always its `error.code`.

| Code | Message | When |
| --- | --- | --- |
| 400 | `invalid filter value type` | A filter value is not the type the filter takes. |
| 403 | `login required` | The endpoint needs an identity and there is none. |
| 403 | `permission denied` | The identity exists but may not see this. |
| 404 | `page/object not found` | No such object, or `page` is not a positive integer. |

## Filters

Basic filters take one value; list filters repeat. Repeated values of one parameter are OR, different parameters
are AND. Booleans are `True` and `False` as DMOJ wrote them, case-insensitively, and `1` and `0` are accepted.

```bash
curl -s -H "Authorization: Bearer $MOJ_API_TOKEN" \
  'https://judge.example.org/api/v2/problems?type=Implementation&partial=True&page=2'
```

## API v2 endpoints

Every endpoint is `GET` and takes `?page=`.

| Path | Basic filters | List filters |
| --- | --- | --- |
| `/api/v2/problems` | `partial` | `code`, `group`, `type`, `organization`, `search` |
| `/api/v2/problem/<code>` | | |
| `/api/v2/contests` | `is_rated` | `key`, `tag`, `organization` |
| `/api/v2/contest/<key>` | | |
| `/api/v2/participations` | `contest`, `user`, `is_disqualified`, `virtual_participation_number` | |
| `/api/v2/users` | | `id`, `username`, `organization` |
| `/api/v2/user/<username>` | | |
| `/api/v2/submissions` | `user`, `problem`, `contest` | `id`, `language`, `result` |
| `/api/v2/submission/<id>` | | |
| `/api/v2/organizations` | `is_open` | `id` |
| `/api/v2/languages` | `common_name` | `id`, `key` |
| `/api/v2/judges` | | |

`search` is repeatable, joined with spaces, and matched case-insensitively against the name, the code and the
statement.

- **`/api/v2/problems`** carries `code`, `name`, `types`, `group`, `points`, `partial`,
  `is_organization_private` and `is_public`. The detail form adds `authors`, `time_limit`, `memory_limit`,
  `language_resource_limits` (`language`, `time_limit`, `memory_limit` per entry), `short_circuit`, `languages`
  and `organizations`, the last empty unless the problem is organisation-private.
- **`/api/v2/contest/<key>`** adds `has_rating`, `rating_floor`, `rating_ceiling`, `performance_ceiling`,
  `hidden_scoreboard`, `scoreboard_visibility` (`V`, `C`, `P`, `H`), `is_organization_private`, `organizations`,
  `is_private`, a `format` object, `problems` and `rankings`. `problems` retains one entry per contest problem,
  in contest order. An unreleased list or an inaccessible problem produces a restricted entry, as below.
  [List release rules](/using/contests#problem-list-release) apply to the token's owner or signed-out visitor.
  `rankings` is the full board or an empty array, never a frozen one, and lists live participations only.
- **`/api/v2/contests`** carries `time_limit`, the per-participant window in seconds, or `null`.
- **`/api/v2/participations`** has `virtual_participation_number` 0 for a live participation. Spectating
  participations are not listed.
- **`/api/v2/users`** has `id`, `username`, `points`, `performance_points`, `problem_count`, `rank` and `rating`.
  Unlisted and deactivated accounts are absent. The detail form adds `about`, `solved_problems`, `organizations`
  and `contests`, each with `key`, `score`, `cumulative_time`, `rating`, `raw_rating` and `performance`, for
  ended contests the caller may see.
- **`/api/v2/submissions`** follows the problem's visibility. Other users' contest submissions are also omitted
  if the caller cannot see the contest or its released problem-list association, even for a public problem.
  For a contest submission, `contest` is an object
  with `key`, `points`, `virtual_participation_number` and `time_since_start_of_participation`.
- **`/api/v2/submission/<id>`** adds `status`, `case_points`, `case_total` and `cases`, and applies the source
  visibility setting. It answers `403 login required` with no `Authorization` header at all. The id may be an
  imported number or a document id.
- **`/api/v2/organizations`** has `id`, `slug`, `short_name`, `is_open`, `member_count`.
- **`/api/v2/languages`** has `id`, `key`, `short_name`, `common_name`, `ace_mode_name`, `pygments_name` and
  `code_template`. The last two are fed from the editor mode and the highlighting language, and keep their names
  because scripts read them.
- **`/api/v2/judges`** lists online judges only: `name`, `start_time`, `ping`, `load`, `languages`.

Contest problem entries always carry `points`, `partial`, `is_pretested`, `max_submissions` and `label`.
Accessible entries add `name` and `code`, with no `kind` field. Restricted entries add `"kind": "restricted"`
and omit both `name` and `code`; clients must check before displaying a name or building a problem link.
Their positions still correspond to the ranking's problem breakdown.

```json
{
  "kind": "restricted", "label": "A", "points": 100,
  "partial": false, "is_pretested": false, "max_submissions": null
}
```

A submission list entry:

```json
{
  "id": 918442, "problem": "aplusb", "user": "alice",
  "date": "2026-09-10T03:59:12.000Z", "language": "PY3",
  "time": 0.031, "memory": 9216, "points": 100.0, "result": "AC", "contest": null
}
```

An entry in `cases` is a case or a batch, a batch's `points` being the minimum over its cases and `total` the
maximum:

```json
{ "type": "case", "case_id": 3, "status": "AC", "time": 0.02, "memory": 9216, "points": 10, "total": 10 }
{ "type": "batch", "batch_id": 2, "cases": [], "points": 0, "total": 40 }
```

## The problems API

Used by [problem repositories](/problems/repos-and-ci). The key's owner must also be allowed to edit the
problem. Errors are `{"error": {"code": "<name>", "message": "..."}}`, where `unauthenticated` is 401,
`forbidden` 403, `not_found` 404, `conflict` 409, `payload_too_large` 413, `invalid` 422 and `internal` 500.

### `PUT /api/problems/<code>`

Creates the problem when the code is new, updates it otherwise. Unknown keys are rejected rather than ignored.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Required on create. |
| `statement` | string | Markdown. |
| `editorial` | object or null | `{content, isPublic?, publishOn?}`. Applied only when `content` is not blank. |
| `points`, `timeLimit`, `memoryLimit` | number | Positive. Seconds and kilobytes. |
| `shortCircuit`, `partial` | boolean | |
| `isPublic` | boolean | Setting it true needs `judge.change_public_visibility`. |
| `authors`, `curators`, `testers` | string arrays | Usernames. An empty array means unchanged. |
| `summary` | string | |
| `languageLimits` | object | `{"python3": {"timeLimit": 3, "memoryLimit": 256000}}`. Both keys required per language. |
| `group`, `types`, `publishOn`, `checkAll` | | Create only. |

```bash
curl -X PUT "$JUDGE_URL/api/problems/aplusb" \
  -H "Authorization: Bearer $JUDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name": "A Plus B", "points": 100, "timeLimit": 1, "memoryLimit": 256000, "isPublic": true}'
```

The response is `{"ok": true, "created": false, "problem": {...}}`, plus `warnings` when a username or language
key was not recognised. On create the defaults are the `uncategorized` group and type, 1 second, 1000000 KB, 100
points, short circuit on, not public, every language allowed, and the publish date now. `languageLimits` replaces
the entries it names. Every successful call writes a revision, and `DELETE` answers 405.

### `POST /api/problems/<code>/images`

Multipart, field `file`; DMOJ's `markdown-image-upload` is accepted too. Images are capped at 10 MB and are
content-addressed, so posting the same bytes twice returns the same link. The response is
`{"status": 200, "link": "..."}`, and `GET /api/problems/images/<id>` serves the image back with a one-year
immutable cache header.

### Test data

| Call | Purpose |
| --- | --- |
| `GET /api/problems/<code>/data` | `{"ok": true, "hash", "size", "fileCount", "uploadedAt"}`, or `hash: null` when the site holds nothing. |
| `POST /api/problems/<code>/data/upload-url` | `{"ok": true, "uploadUrl"}`. PUT the zip bytes there; it answers `{"storageId": "..."}`. |
| `POST /api/problems/<code>/data` | `{"storageId", "hash", "size", "fileCount"}` in, `{"ok": true, "hash", "changed"}` out. |

The archive's root holds `init.yml` and everything it references. `hash` is the sha256 of the archive bytes, 64
lowercase hex digits; the judge verifies its download against it. `changed: false` means the site already held
those bytes, so nothing is replaced and the uploaded blob is deleted. Otherwise the archive replaces the old one,
whose blob is deleted, and the problem gets a revision. An archive of 64 MB or less is parsed first, so an
invalid zip or a member escaping the extraction root is a 422 rather than a broken grade later.

## Notes for clients

Times are ISO 8601 in UTC on API v2 and epoch milliseconds on the problems API. Durations are seconds and memory
is kilobytes everywhere. Ids imported from DMOJ are preserved. For anything that has to be live, such as a board
on a screen, use the site itself: there is no websocket API for third parties.
