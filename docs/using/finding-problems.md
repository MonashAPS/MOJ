# Finding problems

The problem list at `/problems/` is the page most people spend the most time on, so it has a filter panel, a
command palette and a few ways to compare yourself against other people.

## The filter panel

Every filter is kept in the URL query string, so a filtered list is a link you can paste into a channel and
everyone sees the same set.

| Control | Query parameter | What it does |
| --- | --- | --- |
| Search problems | `search` | Matches the problem code and name. |
| Full text search | `full_text=1` | Widens the search to the text of the statement as well. |
| Status | `status=all\|solved\|attempted\|unsolved` | Relative to you. The three narrowing values need you to be signed in. |
| Hide solved problems | `hide_solved=1` | A shortcut for Unsolved. It wins over `status` when both are set. |
| Category | `category=<group name>` | The problem group, which is usually the source of the problem. |
| Types | `type=<name>`, repeatable | One or more problem types, such as Data Structures or Graph Theory. |
| Show problem types | `show_types=1` | Shows each problem's types in the table. |
| Points | `point_start`, `point_end` | A minimum and a maximum point value. |
| Solved by | `solved_by=<username>`, repeatable | Lists the problems those people have solved. |
| and not by me | `not_by_me=1` | A modifier on Solved by: only the problems they solved and you have not. |
| Author | `author=<username>` | Problems set by a given person. |
| Contest | `contest=<key>`, repeatable | Lists the problems that appeared in those contests. |
| Group by contest | `group_by_contest=1` | Breaks the list into sections headed by the contest name. |
| Has editorial | `has_public_editorial=1` | Only problems with a published editorial. |
| Sort | `order=<field>` | `code`, `name`, `points`, `ac_rate`, `user_count` or `date`. A leading `-` sorts descending. |

Clicking a table column header sorts by it, which reaches four more orderings the dropdown does not offer:
group, solved state, type and editorial.

**Reset** clears every filter except the sort and the Show problem types switch.

**Solved by** with **and not by me** is the practice list. Point it at someone a bit stronger than you and you get
the problems they have done and you have not, sorted however you like:

```
/problems/?solved_by=alice&not_by_me=1&order=-points
```

The user page has the same thing from the other direction. `/user/<user>/solved` has a **Compare with me**
toggle, which reduces the list to the problems that person has solved and you have not. It keeps its state in the
URL as `?compare=1`, so a comparison is a link too.

## Grouping by contest

The **Contest** filter is opt-in and its section of the panel starts closed. Pick one or more contests and the
list shows only their problems. The **Group by contest** switch beside it breaks the list into sections with the
contest name as the header, in contest order, so a past round reads as a round rather than as an alphabetical
jumble.

This is the quickest way to work through a past contest without joining it virtually.

## What a problem tells you about itself

The problem page's info box carries four figures: **Solvers**, **Attempts**, **AC rate** and **Fastest**, the best
time anyone has recorded. When someone holds that time, their name is shown under the tiles. It is a fairer guide
to difficulty than the point value on problems that were set before a site's scale settled.

At the bottom of the info box is a **Show contests** disclosure. Expanding it lists the contests the problem has
appeared in: the label it had there, the contest name linking to that contest's ranking page, and the date. It
starts collapsed and stays that way until you ask for it, because a contest or workshop name can give the
technique away. Your choice is remembered in the browser. The first three are shown, with **Show all** for the
rest.

The **Editorial** tab asks before it opens, for the same reason: a dialog titled "View the editorial?" with a
"Don't ask me again" checkbox. Ticking it stops the question for good in that browser. A link straight to
`/problem/<code>/editorial` from somewhere else is not intercepted, so a shared link still works.

`/problem/<code>/rank/` is the leaderboard for a single problem. Above the table is a **By language** panel, one
tile per language with its accepted count, its AC rate and its best time, so you can see what the fastest Python
submission looks like next to the fastest C++ one. That comparison is the honest way to tell whether a problem's
time limit is fair to interpreted languages.

## The command palette

Ctrl+K, Cmd+K, or `/` when you are not typing in a field, opens a palette from anywhere on the site. Type and it
searches problems, contests, users and organisations at once, and the arrow keys move through the results. It
remembers the last few things you opened and offers them under **Recent** when the box is empty, so the second
visit to a problem is two keystrokes.

It also carries a few fixed entries: the four main lists, a **Search all problems** entry that takes your term to
`/problems/`, **Random problem**, and **Toggle dark mode**.

Escape closes it. The `/` binding never fires while you are in a text box, which matters on the submit page.

## Finding a user

`/users/` has a username search that jumps straight to the page of the ranking that person is on, which is DMOJ's
`/users/find` behaviour. It is the fastest way to see where someone sits in the standings without paging through
a few thousand rows. Unlisted users are not in the ranking and are not found this way.

The same search is in the command palette, if you want the profile rather than the position.

## Random problem

`/problems/random/` sends you to a problem at random. It reads the category, the types, the point range, the has
editorial switch and the status filter from the page you clicked it on, so set those first if you want a problem
at a particular difficulty. Turn on **Hide solved problems** if you want one you have not done: by default it can
pick a problem you have already solved.

It is not available while you are inside a contest.
