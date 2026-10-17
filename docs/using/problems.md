# Problems

The problem list is `/problems/`. Every filter is kept in the query string, so a filtered list is a link you can
paste to someone else.

![The problem list with its filter panel](/screenshots/problem-list.png)

| Control | Parameter |
| --- | --- |
| Search problems, and full text search | `search`, `full_text=1` |
| Status, relative to you | `status=all\|solved\|attempted\|unsolved` |
| Hide solved problems, which wins over Status | `hide_solved=1` |
| Category, the problem group | `category=<group>` |
| Types, repeatable, and showing them in the table | `type=<name>`, `show_types=1` |
| Points, a minimum and a maximum | `point_start`, `point_end` |
| Solved by, repeatable, and narrowed to what you have not done | `solved_by=<username>`, `not_by_me=1` |
| Author | `author=<username>` |
| Contest, repeatable, and sectioned by contest in contest order | `contest=<key>`, `group_by_contest=1` |
| Has editorial | `has_public_editorial=1` |
| Sort by `code`, `name`, `points`, `ac_rate`, `user_count` or `date` | `order=<field>`, `-` for descending |

Clicking a column header also sorts by group, solved state, type and editorial. **Reset** clears everything
except the sort and Show problem types.

A practice list is Solved by plus and not by me:

```
/problems/?solved_by=alice&not_by_me=1&order=-points
```

`/user/<user>/solved` has the same thing from the other side, with a **Compare with me** toggle at `?compare=1`.

## On a problem page

The info box shows Solvers, Attempts, AC rate and the fastest recorded time. **Show contests** lists the contests
the problem appeared in; it starts collapsed because a contest name can give the technique away, and your choice
is remembered in the browser. The **Editorial** tab asks before it opens, with a "Don't ask me again" checkbox; a
direct link to `/problem/<code>/editorial` is not intercepted.

`/problem/<code>/rank/` is the leaderboard for one problem, with a **By language** panel giving each language's
accepted count, AC rate and best time.

A code golf problem says so above its statement, with the shortest accepted length so far: inside a contest the
shortest among its live participants, otherwise the shortest of any submission. The shortest accepted solution scores full points
and a longer one scores in proportion, so your points drop when someone submits something shorter. Golf
submissions show their length in bytes in the submission list, and their points where other problems show the
case score; the case score is in the tooltip. A golf submission's status page leads with its points, its length and
the shortest it was scored against, and its cases are the judge's checks of whether it is accepted. See
[Scoring](/problems/format#scoring).

A staff-scored problem says so above the submit button. No judge runs your submission: it shows `RV`
(awaiting review) until a problem setter or contest organiser scores it, then its score and any note they left.

## Getting around

Ctrl+K, Cmd+K, or `/` when you are not typing in a field opens the command palette, which searches problems,
contests, users and organisations at once, remembers what you opened recently, and carries the four main lists,
**Search all problems**, **Random problem** and **Toggle dark mode**.

`/problems/random/` reads the category, types, point range, editorial switch and status filter from the page you
clicked it on, and is not available inside a contest. `/users/` jumps to the page of the ranking a person is on;
unlisted users are not found.
