# API

MOJ has two HTTP APIs. **API v2** is DMOJ's read API, at the same URLs with the same envelope and the same
filters, so scripts written against `judge.monashaps.com` keep working. The **problems API** is a write API used by
problem repositories to publish statements and metadata.

Both authenticate with an API token. See [accounts and 2FA](/using/accounts#api-tokens) for how to make one.

## Authentication

```
Authorization: Bearer <token>
```

Tokens are 48 characters matching `[a-zA-Z0-9_-]{48}`. Requests without a token get whatever a signed-out visitor
would see, which for most list endpoints is the public subset.

| Status | Message | Meaning |
| --- | --- | --- |
| 400 | Invalid authorization header | The header is malformed. It has to be exactly `Bearer ` followed by the 48 characters. |
| 401 | Invalid token | The token does not exist, or has been revoked. |
| 403 | Admin inaccessible | You tried to reach a staff-only resource with a token. Tokens never grant staff access. |

A token carries its owner's visibility and nothing more. Calling `/api/v2/problems` with a setter's token includes
their unpublished problems; calling it with no token does not.

Requests are rate limited per token and per address. A client that stays under about 90 requests a minute will not
notice.

## Envelope

Every API v2 response has the same shape:

```json
{
  "api_version": "2.0",
  "method": "GET",
  "fetched": "2026-09-10T04:21:08.135Z",
  "data": {}
}
```

Exactly one of `data` and `error` is present. `fetched` is the server's time in ISO 8601.

An error:

```json
{
  "api_version": "2.0",
  "method": "GET",
  "fetched": "2026-09-10T04:21:08.135Z",
  "error": {
    "code": 404,
    "message": "Problem not found"
  }
}
```

A single object:

```json
{
  "data": {
    "object": {}
  }
}
```

A list:

```json
{
  "data": {
    "current_object_count": 50,
    "objects_per_page": 50,
    "total_objects": 1284,
    "page_index": 1,
    "total_pages": 26,
    "has_more": true,
    "objects": []
  }
}
```

Pages are one-indexed and selected with `?page=`. Page size is fixed by the server; do not assume 50 will stay 50,
read `objects_per_page`.

```bash
curl -s -H "Authorization: Bearer $JUDGE_API_KEY" \
  'https://judge.monashaps.com/api/v2/problems?page=2' | jq '.data.objects | length'
```

## Filters

Two kinds, both as query parameters.

**Basic filters** take one value. `?partial=True` returns only problems with partial scoring.

**List filters** repeat. `?organization=1&organization=2&type=Implementation` returns problems that are private to
organisation 1 or 2, and whose types include Implementation. Repeated values of the same parameter are combined
with OR; different parameters are combined with AND.

Booleans are `True` and `False`, capitalised, as DMOJ wrote them.

## API v2 endpoints

### `/api/v2/problems`

Basic filters: `partial`. List filters: `code`, `group`, `type`, `organization`. Also `search`, which matches the
name, code and description.

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
  "authors": ["indra"],
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

### `/api/v2/contests`

Basic filters: `is_rated`. List filters: `key`, `tag`, `organization`.

```json
{
  "key": "mcpc26",
  "name": "MCPC 2026",
  "start_time": "2026-09-20T00:00:00Z",
  "end_time": "2026-09-20T05:00:00Z",
  "is_rated": true,
  "rate_all": false,
  "time_limit": null,
  "tags": ["onsite"]
}
```

### `/api/v2/contest/<key>`

The contest object above plus `has_rating`, `rating_floor`, `rating_ceiling`, `performance_ceiling`,
`hidden_scoreboard`, `scoreboard_visibility` (`V`, `C`, `P` or `H`), `is_organization_private`, `organizations`,
`is_private`, a `format` object with `name` and `config`, a `problems` array with `points`, `partial`,
`is_pretested`, `max_submissions`, `label`, `name` and `code`, and a `rankings` array.

Each ranking entry has `user`, `start_time`, `end_time`, `score`, `cumulative_time`, `tiebreaker`, `old_rating`,
`new_rating`, `is_disqualified` and `solutions`, which is a list of format-dependent per-problem objects.

Rankings honour the scoreboard rules. A frozen contest returns the frozen board to anyone who would see a frozen
board in a browser.

### `/api/v2/participations`

Basic filters: `contest`, `user`, `is_disqualified`, `virtual_participation_number`.

```json
{
  "user": "indra",
  "contest": "mcpc26",
  "start_time": "2026-09-20T00:00:00Z",
  "end_time": "2026-09-20T05:00:00Z",
  "score": 7,
  "cumulative_time": 812,
  "tiebreaker": 0,
  "is_disqualified": false,
  "virtual_participation_number": 0
}
```

`virtual_participation_number` is 0 for a live participation, a positive number for a virtual one.

### `/api/v2/users`

List filters: `id`, `username`, `organization`.

```json
{
  "id": "u_2c9f...",
  "username": "indra",
  "points": 1840.2,
  "performance_points": 1102.5,
  "problem_count": 214,
  "rank": "user",
  "rating": 1673
}
```

### `/api/v2/user/<username>`

The user object plus `solved_problems`, `organizations` and `contests`, where each contest entry has `key`,
`score`, `cumulative_time`, `rating`, `raw_rating` and `performance`.

### `/api/v2/submissions`

Basic filters: `user`, `problem`. List filters: `id`, `language`, `result`.

```json
{
  "id": 918442,
  "problem": "aplusb",
  "user": "indra",
  "date": "2026-09-10T03:59:12Z",
  "language": "PY3",
  "time": 0.031,
  "memory": 9216,
  "points": 100.0,
  "result": "AC"
}
```

Submission visibility follows the site's rules, including a contest's source visibility setting, so a contest in
progress does not leak through the API.

### `/api/v2/submission/<id>`

The submission object plus `status`, `case_points`, `case_total` and `cases`. Each entry in `cases` is either a
case or a batch:

```json
{ "type": "case", "case_id": 3, "status": "AC", "time": 0.02, "memory": 9216, "points": 10, "total": 10 }
```

```json
{ "type": "batch", "batch_id": 2, "points": 0, "total": 40, "cases": [] }
```

### `/api/v2/organizations`

Basic filters: `is_open`. List filters: `id`.

```json
{
  "id": 3,
  "slug": "maps",
  "short_name": "MAPS",
  "is_open": true,
  "member_count": 412
}
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

`ace_mode_name` and `pygments_name` are kept for compatibility. MOJ's editor is CodeMirror and its highlighting is
Shiki, but the field names did not change, because scripts read them.

### `/api/v2/judges`

```json
{
  "name": "judge-1",
  "start_time": "2026-09-09T22:14:03Z",
  "ping": 41.2,
  "load": 0.12,
  "languages": ["CPP17", "PY3", "JAVA"]
}
```

## The problems API

The write API used by [problem repositories](/problems/repos-and-ci). It needs a token with the `problems:write`
scope, and the token's owner needs permission to edit the problem.

### `PUT /api/problems/<code>`

Creates the problem if the code is new, updates it otherwise. Body is JSON; every field is optional except `name`
on create.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Required on create. |
| `statement` | string | Markdown. |
| `editorial` | object | `{ "content": string, "isPublic": boolean, "publishOn": ISO date }`. |
| `points` | number | |
| `timeLimit` | number | Seconds. |
| `memoryLimit` | number | Kilobytes. |
| `shortCircuit` | boolean | |
| `isPublic` | boolean | |
| `authors` | string array | Usernames. An empty array means "unchanged". |
| `testers` | string array | Usernames. |
| `group` | string | Create only. |
| `types` | string array | Create only. |
| `publishOn` | ISO date | Create only. |
| `languageLimits` | object | `{ "python3": { "timeLimit": 3 }, "pypy3": { "timeLimit": 3 } }`. |

```bash
curl -X PUT "https://judge.monashaps.com/api/problems/aplusb" \
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
- `authors: []` is treated as absent, so an empty array cannot clear the author list;
- `group`, `types` and `publishOn` apply on create only and are never overwritten by a later update, so the staff
  console owns them after the first upload;
- on create, the defaults are the `uncategorized` group and type, publish now, and every language allowed;
- `languageLimits` is replaced when present;
- `DELETE` is not supported. Retiring a problem is a staff console action.

Responses are the standard envelope with the problem object in `data.object`. A create returns 201, an update
returns 200.

### `POST /api/problems/<code>/images`

Multipart upload with the field name `file`. Returns:

```json
{ "status": 200, "link": "https://judge.monashaps.com/media/problems/aplusb/diagram.png" }
```

```bash
curl -X POST "https://judge.monashaps.com/api/problems/aplusb/images" \
  -H "Authorization: Bearer $JUDGE_API_KEY" \
  -F "file=@images/diagram.png"
```

Uploads are content-addressed, so posting the same bytes twice returns the same link rather than storing a second
copy. Put the returned link into the statement before sending it; `upload-problem.mjs` does that for you.

## Notes for clients

- Times are ISO 8601 in UTC. Durations are seconds. Memory is kilobytes.
- Ids that came from the old site are preserved, so a submission id from DMOJ is the same submission id here.
- The API is read-mostly and cached briefly. For anything that has to be live, such as a scoreboard on a screen,
  use the site, which is a live subscription rather than a poll.
- There is no websocket API for third parties. If you need one, open a ticket describing what you are building.
