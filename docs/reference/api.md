# API

MOJ has two HTTP APIs.

**API v2** is DMOJ's read API, at the same URLs with the same envelope and the same filters, so scripts written
against a DMOJ site keep working. It is served by the web app, at `https://judge.example.org/api/v2/...`.

The **problems API** is a write API used by problem repositories to publish statements and metadata. It is served
by the Convex backend's HTTP origin, but the site publishes it on its own origin under `/api/problems/`, so its
base URL is just the address of the judge: `https://judge.example.org`. `/admin/api-keys` prints the right base URL
for the deployment you are looking at.

Both authenticate with an API token. See [accounts and 2FA](/using/accounts#api-tokens) for how to make one.

## Authentication

```
Authorization: Bearer <token>
```

API v2 requires exactly `Bearer ` followed by 48 characters from `A-Za-z0-9_-`. A request with no `Authorization`
header is served as a signed-out visitor, which for most list endpoints is the public subset.

| Response | Meaning |
| --- | --- |
| `400 Invalid authorization header` | The header is present but malformed. Plain text, not the envelope. |
| `401 Invalid token` | The token does not exist, has been revoked, or belongs to a banned account. Plain text, with `WWW-Authenticate: Bearer realm="API"`. |

A token acts as its owner. It carries the owner's visibility **and** their permissions, so a token belonging to a
staff member sees what that staff member sees. Treat one accordingly. Calling `/api/v2/problems` with a setter's
token includes their unpublished problems; calling it with no token does not.

Two kinds of token verify. A token minted by this site is checked against Better Auth's API key plugin. A token
minted by a DMOJ site you imported from is checked against `LEGACY_SECRET_KEY`, the old site's Django
`SECRET_KEY`; without that variable set, legacy tokens are rejected and new ones still work.

A token carries one or both of exactly two scopes, `read` and `problems:write`. API v2 does not check them; the
problems API does, and requires `problems:write`.

There is no rate limiting on either API. Be polite anyway.

## Envelope

Every API v2 response has the same shape:

```json
{
  "api_version": "2.0",
  "method": "get",
  "fetched": "2026-09-11T04:21:08.135Z",
  "data": {}
}
```

`method` is lowercase, as DMOJ writes it. Exactly one of `data` and `error` is present. `fetched` is the server's
time in ISO 8601 with milliseconds.

An error, whose HTTP status is always the same number as `error.code`:

```json
{
  "api_version": "2.0",
  "method": "get",
  "fetched": "2026-09-11T04:21:08.135Z",
  "error": { "code": 404, "message": "page/object not found" }
}
```

There are four of them:

| Code | Message | When |
| --- | --- | --- |
| 400 | `invalid filter value type` | A filter value is not the type the filter takes. |
| 403 | `login required` | The endpoint needs a signed-in identity and there is none. |
| 403 | `permission denied` | The identity exists but may not see this. |
| 404 | `page/object not found` | No such object, or a `page` outside the range. |

A single object:

```json
{ "data": { "object": {} } }
```

A list:

```json
{
  "data": {
    "current_object_count": 1000,
    "objects_per_page": 1000,
    "page_index": 1,
    "has_more": true,
    "objects": [],
    "total_objects": 1284,
    "total_pages": 2
  }
}
```

Pages are one-indexed and selected with `?page=`. A page past the end is an empty `objects` array, not an error.
Page size is fixed by the server at 1000; read `objects_per_page` rather than assuming it.

`/api/v2/submissions` filtered by a basic filter omits `total_objects` and `total_pages`, because the count is not
known without walking the whole table. A very large result is capped at 20000 rows scanned per request, and
`has_more` stays true rather than lying about the end.

```bash
curl -s -H "Authorization: Bearer $MOJ_API_TOKEN" \
  'https://judge.example.org/api/v2/problems?page=2' | jq '.data.objects | length'
```

## Filters

Two kinds, both as query parameters.

**Basic filters** take one value. `?partial=True` returns only problems with partial scoring.

**List filters** repeat. `?organization=1&organization=2&type=Implementation` returns problems that are private to
organisation 1 or 2, and whose types include Implementation. Repeated values of the same parameter are combined
with OR; different parameters are combined with AND.

Booleans are `True` and `False`, as DMOJ wrote them; the parser is case-insensitive and also takes `1` and `0`.
Anything else is `400 invalid filter value type`.

## API v2 endpoints

### `/api/v2/problems`

Basic filters: `partial`. List filters: `code`, `group`, `type`, `organization`. Also `search`, which is
repeatable, joined with spaces, and matched case-insensitively against the name, the code and the statement.

```json
{
  "code": "aplusb",
  "name": "A Plus B",
  "types": ["Uncategorized"],
  "group": "Uncategorized",
  "points": 100,
  "partial": false,
  "is_organization_private": false,
  "is_public": true
}
```

### `/api/v2/problem/<code>`

```json
{
  "code": "aplusb",
  "name": "A Plus B",
  "authors": ["alice"],
  "types": ["Uncategorized"],
  "group": "Uncategorized",
  "time_limit": 1.0,
  "memory_limit": 256000,
  "language_resource_limits": [
    { "language": "PY3", "time_limit": 3.0, "memory_limit": 256000 }
  ],
  "points": 100,
  "partial": false,
  "short_circuit": true,
  "languages": ["CPP17", "PY3", "JAVA"],
  "is_organization_private": false,
  "organizations": [],
  "is_public": true
}
```

`organizations` is empty unless the problem is organisation-private.

### `/api/v2/contests`

Basic filters: `is_rated`. List filters: `key`, `tag`, `organization`.

```json
{
  "key": "spring26",
  "name": "Spring Contest 2026",
  "start_time": "2026-09-20T00:00:00.000Z",
  "end_time": "2026-09-20T05:00:00.000Z",
  "time_limit": null,
  "is_rated": true,
  "rate_all": false,
  "tags": ["onsite"]
}
```

`time_limit` is the per-participant window in seconds, or `null` for an ordinary contest.

### `/api/v2/contest/<key>`

The contest object above plus `has_rating`, `rating_floor`, `rating_ceiling`, `performance_ceiling`,
`hidden_scoreboard`, `scoreboard_visibility` (`V`, `C`, `P` or `H`), `is_organization_private`, `organizations`,
`is_private`, a `format` object with `name` and `config`, a `problems` array, and a `rankings` array.

Each entry in `problems` has `points`, `partial`, `is_pretested`, `max_submissions`, `label`, `name` and `code`.
The array is empty unless the caller is in the contest, the contest has ended, or the caller can edit it.

Each entry in `rankings` has `user`, `start_time`, `end_time`, `score`, `cumulative_time`, `tiebreaker`,
`old_rating`, `new_rating`, `is_disqualified` and `solutions`, a per-problem list whose entries are
`{"points": n, "time": n}` or `null`. Only live participations appear.

Rankings honour the scoreboard rules. A frozen contest returns the frozen board to anyone who would see a frozen
board in a browser.

### `/api/v2/participations`

Basic filters: `contest`, `user`, `is_disqualified`, `virtual_participation_number`.

```json
{
  "user": "alice",
  "contest": "spring26",
  "start_time": "2026-09-20T00:00:00.000Z",
  "end_time": "2026-09-20T05:00:00.000Z",
  "score": 7,
  "cumulative_time": 812,
  "tiebreaker": 0,
  "is_disqualified": false,
  "virtual_participation_number": 0
}
```

`virtual_participation_number` is 0 for a live participation and a positive number for a virtual one. Spectating
participations are not listed.

### `/api/v2/users`

List filters: `id`, `username`, `organization`.

```json
{
  "id": 42,
  "username": "alice",
  "points": 1840.2,
  "performance_points": 1102.5,
  "problem_count": 214,
  "rank": "user",
  "rating": 1673
}
```

Unlisted and deactivated accounts are not listed.

### `/api/v2/user/<username>`

The user object plus `about`, `solved_problems`, `organizations` and `contests`, where each contest entry has
`key`, `score`, `cumulative_time`, `rating`, `raw_rating` and `performance`. Only live participations in contests
that have ended and that the caller may see are included.

### `/api/v2/submissions`

Basic filters: `user`, `problem`, `contest`. List filters: `id`, `language`, `result`.

```json
{
  "id": 918442,
  "problem": "aplusb",
  "user": "alice",
  "date": "2026-09-10T03:59:12.000Z",
  "language": "PY3",
  "time": 0.031,
  "memory": 9216,
  "points": 100.0,
  "result": "AC",
  "contest": null
}
```

For a contest submission, `contest` is an object with `key`, `points`, `virtual_participation_number` and
`time_since_start_of_participation` in seconds.

Submission visibility follows the site's rules, including the source visibility setting, so a contest in progress
does not leak through the API.

### `/api/v2/submission/<id>`

The submission object plus `status`, `case_points`, `case_total` and `cases`. The id may be a numeric id carried
over from DMOJ or a document id. Each entry in `cases` is a case or a batch:

```json
{ "type": "case", "case_id": 3, "status": "AC", "time": 0.02, "memory": 9216, "points": 10, "total": 10 }
```

```json
{ "type": "batch", "batch_id": 2, "cases": [], "points": 0, "total": 40 }
```

A batch's `points` is the minimum over its cases and `total` the maximum, which is how a batch scores all or
nothing.

This endpoint answers `403 login required` when there is no `Authorization` header at all.

### `/api/v2/organizations`

Basic filters: `is_open`. List filters: `id`.

```json
{ "id": 3, "slug": "example", "short_name": "EXAMPLE", "is_open": true, "member_count": 412 }
```

### `/api/v2/languages`

Basic filters: `common_name`. List filters: `id`, `key`.

```json
{
  "id": 4,
  "key": "PY3",
  "short_name": "Python 3",
  "common_name": "Python",
  "ace_mode_name": "python",
  "pygments_name": "python3",
  "code_template": ""
}
```

`ace_mode_name` and `pygments_name` are kept for compatibility, and are fed from the editor mode and the
highlighting language. MOJ's editor is CodeMirror and its highlighting is Shiki, but the field names did not
change, because scripts read them.

### `/api/v2/judges`

Online judges only.

```json
{
  "name": "judge-1",
  "start_time": "2026-09-09T22:14:03.000Z",
  "ping": 41.2,
  "load": 0.12,
  "languages": ["CPP17", "PY3", "JAVA"]
}
```

## The problems API

The write API used by [problem repositories](/problems/repos-and-ci). It needs a key with the `problems:write`
scope, and the key's owner needs permission to edit the problem. Its base URL is the address of the judge: the
Convex backend serves it, and the site proxies `/api/problems/*` through to it.

Errors are `{"error": {"code": "<name>", "message": "..."}}`, where the name maps to a status:
`unauthenticated` 401, `forbidden` 403, `not_found` 404, `invalid` **422**, `conflict` 409, `payload_too_large`
413, `internal` 500.

### `PUT /api/problems/<code>`

Creates the problem if the code is new, updates it otherwise. The body is JSON and every field is optional except
`name` on create. Unknown keys are rejected rather than ignored.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Required on create. |
| `statement` | string | Markdown. |
| `editorial` | object or null | `{ "content": string, "isPublic"?: boolean, "publishOn"?: number }`. Applied only when `content` is not blank. |
| `points` | number | |
| `timeLimit` | number | Seconds. |
| `memoryLimit` | number | Kilobytes. |
| `shortCircuit` | boolean | |
| `partial` | boolean | |
| `isPublic` | boolean | Setting it true needs `judge.change_public_visibility`. |
| `authors`, `curators`, `testers` | string arrays | Usernames. An empty array means "unchanged". |
| `summary` | string | |
| `languageLimits` | object | `{ "python3": { "timeLimit": 3, "memoryLimit": 256000 }, ... }`. Both keys are required per language. |
| `group` | string | Create only. |
| `types` | string array | Create only. |
| `publishOn` | number | Epoch milliseconds. Create only. |
| `checkAll` | boolean | Create only. |

```bash
curl -X PUT "$JUDGE_URL/api/problems/aplusb" \
  -H "Authorization: Bearer $JUDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "A Plus B",
    "statement": "Read two integers and print their sum.\n\n## Input\n\nTwo integers.\n",
    "points": 100,
    "timeLimit": 1,
    "memoryLimit": 256000,
    "isPublic": true
  }'
```

Update semantics:

- an absent field is unchanged;
- `authors: []`, `curators: []` and `testers: []` are treated as absent, so an empty array cannot clear a list;
- `group`, `types`, `publishOn` and `checkAll` apply on create only and are never overwritten by a later update,
  so the staff console owns them after the first upload;
- on create, the defaults are the `uncategorized` group and type, a time limit of 1 second, a memory limit of
  1000000 KB, 100 points, short circuit on, not public, every language allowed, and the publish date now;
- `languageLimits` replaces the entries it names and leaves the rest alone. A language key nothing recognises is
  reported as a warning, not an error, and so is an unknown username;
- every successful call writes a revision;
- `DELETE` answers 405. Retiring a problem is a staff console action.

The response is always 200, and is not the API v2 envelope:

```json
{
  "ok": true,
  "created": false,
  "problem": {
    "code": "aplusb",
    "name": "A Plus B",
    "points": 100,
    "timeLimit": 1,
    "memoryLimit": 256000,
    "shortCircuit": true,
    "partial": false,
    "isPublic": true,
    "group": "Uncategorized",
    "types": ["Uncategorized"],
    "authors": ["alice"],
    "testers": [],
    "date": 1789036959000,
    "hasEditorial": false,
    "languageLimits": {},
    "allowedLanguages": []
  }
}
```

`warnings` is present only when there is something to warn about.

### `POST /api/problems/<code>/images`

Multipart upload. The field name is `file`, and DMOJ's `markdown-image-upload` is accepted as well so older
tooling keeps working. Images are capped at 10 MB.

```bash
curl -X POST "$JUDGE_URL/api/problems/aplusb/images" \
  -H "Authorization: Bearer $JUDGE_API_KEY" \
  -F "file=@images/diagram.png"
```

```json
{ "status": 200, "link": "https://convex-site.judge.example.org/api/problems/images/kg2b8..." }
```

Uploads are content-addressed by the sha256 of the bytes, so posting the same image twice returns the same link
rather than storing a second copy. Put the returned link into the statement before sending it; the uploader does
that for you.

`GET /api/problems/images/<id>` serves the image back with a one-year immutable cache header. Serving images
through the API rather than through a raw storage URL is what keeps a statement's image links stable across
storage backends.

### Test data

The site is the source of truth for grading data. A repository publishes one zip archive per problem, judges
fetch it over HTTPS and cache it, and the claim names the hash that graded a submission. A problem the site
holds nothing for still works exactly as before: the judge grades from its own disk.

The archive is a plain zip whose root holds `init.yml` and everything it references — `tests/`, checkers,
graders, generators. Statements, editorials and `config.json` are not in it; they go through `PUT
/api/problems/<code>` above.

All three endpoints need the `problems:write` scope and a key whose owner may edit the problem.

#### `GET /api/problems/<code>/data`

What the site holds, so a publisher can skip an upload it does not need.

```json
{ "ok": true, "hash": "3f786850e387550fdab836ed7e6dc881de23001b", "size": 918273, "fileCount": 42,
  "uploadedAt": 1789036959000 }
```

`{"ok": true, "hash": null}` means the site holds nothing for the problem.

#### `POST /api/problems/<code>/data/upload-url`

```json
{ "ok": true, "uploadUrl": "https://<deployment>.convex.cloud/api/storage/upload?token=..." }
```

PUT the zip bytes to that URL, which answers `{"storageId": "..."}`. This is how an archive of any size avoids
the limit on an HTTP action's request body — the endpoints themselves never carry the archive.

#### `POST /api/problems/<code>/data`

```bash
curl -X POST "$JUDGE_URL/api/problems/aplusb/data" \
  -H "Authorization: Bearer $JUDGE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"storageId": "kg2b8...", "hash": "3f7868...", "size": 918273, "fileCount": 42}'
```

```json
{ "ok": true, "hash": "3f7868...", "changed": true }
```

- `hash` is the sha256 of the archive bytes, 64 lowercase hex digits. The site stores what the publisher says;
  the judge verifies the bytes it downloads against it, so a wrong hash is a loud grading error rather than
  silent corruption.
- `changed: false` means the stored archive already had that hash: nothing is replaced, no revision is written,
  and the blob that was just uploaded is deleted.
- Otherwise the archive replaces whatever the problem held, the previous blob is deleted, and the problem gets a
  revision naming the hash and who published it.
- An archive of 64 MB or less is parsed first: an invalid zip, or a member whose path escapes the extraction
  root, is a 422 rather than a broken grade later. Larger archives are taken on the publisher's word, and the
  judge validates them on extraction either way.
- An upload the site cannot find, or a body that is not the shape above, is a 422.

## Notes for clients

- Times are ISO 8601 in UTC on API v2, and epoch milliseconds on the problems API. Durations are seconds. Memory
  is kilobytes.
- Ids that came from an imported site are preserved, so a submission id from DMOJ is the same submission id here.
- For anything that has to be live, such as a scoreboard on a screen, use the site itself, which is a live
  subscription rather than a poll. There is no websocket API for third parties.
