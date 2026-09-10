# Finding problems

The problem list at `/problems/` is the page most people spend the most time on, so it has a filter panel, a
command palette and a few ways to compare yourself against other users.

## The filter panel

Every filter is kept in the URL query string, so a filtered list is a link you can paste into a channel and
everyone sees the same set.

| Filter | What it does |
| --- | --- |
| Search | Matches the problem name, its code and the text of the statement. |
| Status | All, Solved, Attempted or Unsolved, relative to you. Needs you to be signed in. |
| Solved by | One or more usernames. Lists the problems those users have solved. |
| and not by me | A modifier on **Solved by**: only the problems they solved and you have not. |
| Types | One or more problem types, such as Data Structures or Graph Theory. |
| Group | The problem group, which is usually the source of the problem. |
| Points | A minimum and maximum point value. |
| Author | Problems set by a given user. |
| Contest | One or more contests. Lists the problems that appeared in them. |
| Show editorial-only | Only problems that have a published editorial. |
| Sort | Code, name, points, AC rate, number of solvers, or date. |

**Solved by** with **and not by me** is the practice list. Point it at someone a bit stronger than you and you get
the problems they have done and you have not, sorted however you like:

```
/problems/?solved_by=indra&not_solved_by_me=1&sort=points
```

The user page has the same thing from the other direction. `/user/<user>/solved` has a **Compare with me** toggle,
which reduces the list to the problems that user has solved and you have not.

## Grouping by contest

Pick one or more contests in the **Contest** filter and the list shows only their problems. When the filter is
active a **Group by contest** toggle appears, which breaks the list into sections with the contest name as the
header, in contest order, so a past round reads as a round rather than as an alphabetical jumble.

This is the quickest way to work through a past contest without joining it virtually.

## What a problem tells you about itself

The problem page carries a small stats strip: how many people have solved it, how many attempts it has taken,
the AC rate, the best solve time and who holds it. It is a fair guide to difficulty, and a better one than the
point value on problems that were set before the club's scale settled.

Under the info box, an **Appeared in** line lists every contest the problem has been used in: the contest name,
the label it had there, the date, and a link to that contest's ranking page. A problem that appeared as C in a
division 2 round tells you something the point value does not.

`/problem/<code>/rank/` is the leaderboard for a single problem, and it breaks down by language, so you can see
what the fastest Python submission looks like next to the fastest C++ one. That comparison is the honest way to
tell whether a problem's time limit is fair to interpreted languages.

## The command palette

Ctrl+K, or `/` when you are not typing in a field, opens a palette from anywhere on the site. Type and it searches
problems, users, contests and organisations at once; Enter goes to the top result, and the arrow keys move through
the list. It remembers what you opened recently, so the second visit to a problem is two keystrokes.

Escape closes it. It never steals a keystroke from a text box, which matters on the submit page.

## Finding a user

`/users/` has a username search box that jumps straight to the page of the ranking that contains that user, which
is DMOJ's `/users/find` behaviour. It is the fastest way to see where someone sits in the standings without
paging through a few thousand rows.

The same search is in the command palette, if you want the profile rather than the position.

## Random problem

`/problems/random/` picks a problem you have not solved, honouring whatever filters are active. Set the point range
first if you want a problem at a particular difficulty.
