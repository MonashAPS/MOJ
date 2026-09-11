# Contests

A contest is a set of problems with a start time, an end time and a scoring format. Everything else, the ranking
page, the freeze, ratings, virtual participation and the hall scoreboard, is built on those four things.

Contests live at `/contest/<key>`, their standings at `/contest/<key>/ranking/`, and the list at `/contests/`. The
key follows the same rules as a problem code: lowercase, unique, permanent once the contest has run.

## Formats

The format decides how a set of submissions becomes a score and how ties are broken. Pick it when you create the
contest; changing it afterwards means a rescore. Each format takes a small JSON configuration, edited beside the
format name in the staff console, and an unknown key or a bad value is refused with the same message DMOJ gives.

The contest page shows the scoring rules in words, generated from the format and its configuration, so entrants
never have to be told them separately.

### Default

The score is the sum of the highest-scoring submission on each problem. Ties break on cumulative time, which is
the sum of the times of the last submission to each problem with a non-zero score.

Every submission moves the tiebreaker, not only the ones that change the score, so a contestant who resubmits
after already being correct is penalised. There is nothing to configure. This is the right format for a training
round where the score is what matters and the tiebreaker rarely decides anything.

### IOI

`ioi16` is the modern IOI rule: the score for a problem is the best score achieved on **each batch** across all
submissions, added up. Two submissions that solve different batches combine, so a contestant who scores 30 on
batch 1 in one submission and 40 on batch 2 in another ends with 70 for the problem.

Ties are not broken by default. Set `cumtime` to `true` to break them by the sum of the last score-altering
submission times.

### Legacy IOI

`ioi` is the older ranklist rule: the score for a problem is the score of the single best submission, with no
combining across batches. A contestant who scores 30 in one submission and 40 in another ends with 40, not 70.

Ties are not broken by default; `cumtime: true` breaks them by the times of the most recent score-changing
submissions. Use this only for compatibility with contests that were run this way.

### AtCoder

The score is the sum of the highest-scoring submission on each problem. Ties break on the time of the last
score-changing submission plus a penalty.

The penalty is the number of incorrect submissions before the highest-scoring submission on each solved problem,
multiplied by `penalty`, which is 5 minutes by default. Unlike Default, submissions that do not change the score
do not add time; only the wrong ones add penalty.

### ICPC

The score is the number of problems solved. Ties break first on total penalty time, then on the time of the last
score-changing submission. `penalty` defaults to 20 minutes. This is described in full below, because it is the
one the hall scoreboard always applies.

### ECOO

The score is the sum of the score of the **last** submission to each problem, not the best. A contestant who
solves a problem and then breaks it while trying to optimise keeps the broken score.

Two bonuses on top. `first_ac_bonus`, 10 by default, adds that many points to a problem solved on the first
attempt, ignoring compile errors and internal errors. `time_bonus`, 5 by default, adds one point per whole
interval of that many minutes remaining when a submission with a non-zero score is made; a 50 point submission
made 23 minutes before the end gets 4 bonus points, for 54. Setting `time_bonus` to 0 disables it.
`cumtime: true` breaks ties by the sum of the last submission time on all problems; without it, ties by score are
not broken at all.

### Configuration summary

| Format | Key | Options and defaults | Default labels |
| --- | --- | --- | --- |
| Default | `default` | none | numbers |
| IOI | `ioi16` | `cumtime: false` | numbers |
| Legacy IOI | `ioi` | `cumtime: false` | numbers |
| AtCoder | `atcoder` | `penalty: 5` | numbers |
| ICPC | `icpc` | `penalty: 20` | letters |
| ECOO | `ecoo` | `cumtime: false`, `first_ac_bonus: 10`, `time_bonus: 5` | numbers |

Labels follow the format unless the contest sets its own scheme, which is DMOJ's behaviour: only ICPC letters its
problems and every other format numbers them.

Scores are rounded to the contest's `points_precision`, three decimal places by default. Cumulative time is
stored as whole seconds, truncated rather than rounded, which is what Django's integer column did.

## ICPC rules in detail

A problem counts once, when it is first accepted. Later submissions to a solved problem change nothing, neither
score nor penalty.

The penalty for a solved problem is:

```
minutes from the participation start to the accepted submission
  + penalty_minutes * (number of rejected submissions before it)
```

where `penalty_minutes` is 20 unless the contest configures otherwise. A submission counts as rejected if it has
any result other than accepted, a compile error or an internal error. Compile errors are free, which is
deliberate: a typo is not a wrong idea.

Note that an aborted submission does add a penalty on the contest ranking page, which is DMOJ's rule. The hall
scoreboard is stricter and ignores aborted submissions too, which is the rule the frozen board it is modelled on
uses. The two boards can therefore disagree by one penalty for a contestant whose submission was aborted.

Unsolved problems contribute no penalty at all, however many attempts they took. There is never a reason to leave
a problem alone at the end of an ICPC contest.

Ranking is:

1. problems solved, descending;
2. total penalty, ascending;
3. time of the last accepted submission, ascending.

Contestants who tie on all three share a rank, and the next rank skips past them.

Times are measured from the participation's own start, which for a virtual participant is when they started, not
when the contest did.

A disqualified participation is set aside with a score of -9999 and no cumulative time, which puts it last
whatever the format.

## Freeze and blind mode

A frozen scoreboard is what makes the end of a contest worth watching. Set `freezeMinutes` on the contest and the
public board stops updating that many minutes before the end.

- A frozen cell shows `?` with the number of submissions being withheld under it, so the board shows that
  something is happening without showing what. Hovering says how many submissions came after the freeze.
- Rankings during the freeze are computed from pre-freeze submissions only, so the order shown is the order as of
  the freeze.
- The ranking page carries a notice at the top saying when the board froze.
- Contest editors, and anyone allowed to see the full scoreboard, always see the real board.
- Virtual participants are never frozen. They are running their own clock, and their board is only theirs.
- `freezeMinutes: 0` disables the freeze.

By default a contestant still sees their own verdicts during the freeze, which is DMOJ's behaviour: the board is
frozen but you know whether your own last submission passed. Setting `blindDuringFreeze` makes it stricter: the
contestant's own submission rows and per-case views show pending until the contest ends. That is the ICPC world
finals rule. Staff see everything either way.

After the end time the board stays frozen until someone unfreezes it. There are two ways:

- **Reveal**, stepwise from the bottom of the board upward, one cell at a time, with undo. This is the ceremony,
  driven from the hall scoreboard.
- **Unfreeze**, which drops the freeze entirely and shows the final board at once. Contest editors have a
  **Reveal scoreboard** button on the ranking page for this, and it can be put back with **Freeze scoreboard**.

Nothing expires the freeze on its own, so a contest whose staff go home stays frozen until they come back. That is
deliberate: an accidental reveal cannot be undone in front of an audience.

## The hall scoreboard

`/scoreboard/<event>` is a separate, projector-shaped board for a live event. It is configured by a scoreboard
event in the staff console rather than by a contest, because an event can be several contests at once.
`/scoreboard/` lists the events that exist.

It differs from the contest ranking page in two ways worth knowing before you use it. It always applies ICPC
scoring, whatever formats the underlying contests use, so a scoring contest and a solved-count contest can share
a board. And it ignores each contest's scoreboard visibility, because its whole purpose is to drive a display for
a contest whose own ranking page is hidden from entrants. Treat the URL as public from the moment the event
exists; the only switch is whether the event itself is public or staff-only.

The page is not indexed by search engines.

### Divisions

An event lists several contests. Each becomes a division with its own panel, and the page shows one at a time
with a cross-fade. Divisions keep their own freeze state, their own first blood and their own ranking, and each
keeps its own scroll position through the automatic tour.

### Badges and attendance

Badges come from organisation membership. An event names organisation slugs, and every competitor in one of those
organisations gets that badge beside their name, labelled with the organisation's short name.

One badge is special: the event's in-person organisation marks who is in the room. That drives the **All** and
**In person** toggle, which filters the board down to the people who are physically present and re-ranks what is
left so the board still reads 1, 2, 3 with no gaps. The in-person badge itself is hidden from rows when the
filter is on, since it would be on every row.

The choice is remembered in the browser, so a display box that reboots comes back showing what it was showing.

Badge editing mode lets an organiser fix someone's badges mid-contest. Only the badges that changed are written,
so two organisers editing at once do not overwrite each other. A badge is real organisation membership, so the
change shows up across the site.

### Cell states

| State | Meaning |
| --- | --- |
| Solved | Accepted. Shows the solve minute, and the number of wrong tries beside it. |
| First to solve | The first solve of that problem in that division, ringed in gold. |
| Attempted | Attempted, not solved. Shows the number of tries. |
| Frozen, result withheld | Submitted after the freeze point. Shows `?` and the number of submissions. |
| Judging | A submission is with the judge right now. Shows `?` and how many. |
| Not attempted | An em dash. |

The board is a reactive query, so cells change as verdicts land. There is no refresh button because there is
nothing to refresh.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Left and Right arrows | Previous and next division |
| P | Start or pause the automatic tour, which scrolls each division top to bottom and moves on |
| F | Show or hide the event feed, the sidebar of recent solves |
| I | Switch between All and In person, when the event has an in-person organisation |
| E | Badge editing mode, for staff |
| R | Enter the reveal ceremony, for staff |
| ? | The shortcut sheet |

Inside the reveal: Space, Right arrow or Enter steps forward one cell, Left arrow or Backspace undoes the last
step, and Escape leaves without finishing. The normal shortcuts are suspended while the reveal is running, so an
arrow key cannot change division by accident in front of an audience.

### The reveal ceremony

The reveal walks the frozen board from the bottom row upward. Each step resolves the next frozen cell, the row
re-sorts if it moved, and the next target is highlighted before it is resolved so the room can react. The page
scrolls the target into view on its own.

The reveal is server-side state, not one browser's. Every screen showing the board, the projector, the stream and
the organiser's laptop, turns over the same cell at the same moment.

**Undo** steps back one cell at a time, which is what you want when someone jumps the gun on the projector.
**Reveal all** finishes the board in one step, and because it is one step, undo then unwinds it one cell at a
time rather than putting the whole board back. **Unfreeze** drops the freeze entirely and clears the recorded
reveals, so it is the one action the undo cannot walk back.

The reveal only runs for staff who may edit the contests behind the event, and only while frozen cells remain.
When the ceremony is filtered to the hall, it highlights the bottom-most frozen cell of the rows on screen.

### Themes

`default` is the plain projector board. `olympics` replaces problem labels with sport pictograms, colours each
problem column with that sport's colour, and gives the first solve of each problem a gold medal. A theme only
restyles; the data, the shortcuts and the reveal behave the same.

An event can also give every competitor a small flag beside their name, from a URL template containing
`{username}`. A competitor whose image is missing simply has no flag rather than a broken image.

## Ratings

Rated contests move a rating, using Elo-MMR, which is DMOJ's system, so imported ratings continue rather than
restart. Ratings are stored per participation, so a rating history is the list of contests someone was rated in.

Rating happens when a staff member rates the contest, not automatically at the end, so a contest with a
disqualification to sort out can be rated after it is sorted. Rating a contest re-rates every contest that ended
after it, in end-time order, because each contest's result depends on the ratings going in.

| Setting | What it does |
| --- | --- |
| `isRated` | Whether the contest can be rated at all. |
| `rateAll` | Rate everyone who joined, rather than only those who submitted. |
| `ratingFloor`, `ratingCeiling` | Only rate participants whose rating going in is inside this range. |
| `performanceCeilingOverride` | Cap the performance a contest can award, for a contest whose field is not representative. |
| `rateExcludeProfileIds` | Individuals not to rate, for staff who competed unofficially. |

Rating classes, by rating: Newbie below 1000, Amateur 1000 to 1299, Expert 1300 to 1599, Candidate Master 1600 to
1899, Master 1900 to 2399, Grandmaster 2400 to 2999, Target 3000 and above. The class is the colour a username is
drawn in across the site.

Disqualifying a participation sets its score aside and, if the contest is rated, treats it as a loss for rating
purposes, following DMOJ.

## Joining, spectating and virtual participation

There are three ways to be in a contest, distinguished by the participation's `virtual` field.

**Live** (`virtual = 0`) is joining while the contest is running. The clock is the contest's clock, or, for a
window contest, a personal window that starts when you join. Live participation is what gets rated.

**Spectating** (`virtual = -1`) is for staff and for anyone with permission to watch. A spectator sees the
problems and can submit, but is not on the scoreboard and is not rated. Contest authors, curators and testers
spectate rather than participate.

**Virtual** (`virtual = n > 0`) is running a finished contest against its clock afterwards. The participation gets
its own start time, the timer runs from there, and the run does not appear on the live standings. Virtual
participants are never affected by the freeze, are never rated, and can start a virtual run any number of times;
`n` counts them.

Joining is a confirmation dialog, because the timer cannot be stopped once it starts. Leaving takes you out of
contest mode but does not stop your window: you can rejoin until it closes.

### Window contests

A contest with a `timeLimit` gives every participant their own window of that length inside the contest's overall
start and end. The contest page labels the row **Window** rather than **Duration**, the list page says how long
the window is, and the countdown says when your window closes rather than when the contest ends.

Joining starts your window, so a window contest run over a week lets everyone take the same three hours at a time
that suits them.

### Contest mode

While a participation is live, the site is in **contest mode**: the problem list shows only the contest's
problems, submission lists are filtered to the contest, editorials are hidden and problem voting is disabled.
Leaving the contest, or its window ending, clears it. A cron clears stale contest mode for participations that
ended without anyone leaving.

## The contest problem table

Every contest page lists its problems with, for a signed-in viewer, the state of each one: solved, partially
solved, attempted or not attempted, using the same icons and colours as the problem list, plus your best score
and the public solve count.

On a contest that has ended, the state distinguishes **Solved during the contest** from **Solved since the
contest**, and the score cell shows what you scored during the contest when that differs from your best now. It
is the honest answer to "did I actually get that one in time".

## Access control

Contests stack several independent restrictions. A user has to pass all of them.

- **Visibility.** `isVisible` off means only editors can see the contest exists. This is the state a contest
  should be in while it is being written.
- **Access code.** A contest with an `accessCode` asks for it on join. It is a shared secret typed by everyone in
  the room, not an invitation; anyone with the code can join.
- **Private to users.** `isPrivate` with a list of allowed contestants. Only those users can join.
- **Private to organisations.** `isOrganizationPrivate` with a list of organisations. Members of those
  organisations can join. This is how a contest is restricted to a club without a shared code.
- **Join restrictions.** `limitJoinOrganizations` narrows which organisation a member has to be in to join, and
  `classIds` narrows further to specific classes within an organisation.
- **Banned users.** `bannedProfileIds` blocks specific people from joining regardless of everything else.

Scoreboard visibility is separate from all of that. It is Visible, hidden until your own participation ends,
hidden for the whole contest, or hidden even afterwards, and the contest page says which in words. The hall
scoreboard ignores it.

## Locking

`lockedAfter` freezes a contest's submissions at a point in time. After it, submissions to the contest's problems
from participants cannot be judged or rejudged, and their sources cannot be edited. It exists so that a contest
being used for assessment can be sealed while the marking is checked, and it is separate from the scoreboard
freeze: a locked contest can have a fully public board.

Locking requires the `judge.lock_contest` permission. A locked submission can still be rejudged by a superuser.

## Clarifications

With `useClarifications` on, the contest page grows a Clarifications section and the contest bar links to it.
Staff post a clarification against one of the contest's problems, and it appears for everyone in the contest at
once, because the section is a live subscription rather than a page that has to be reloaded.

## The contest navigation bar

While you are on any page that belongs to a contest, a second bar renders under the main navigation:

- the contest name, linking to the contest page;
- one chip per problem, showing its label, coloured by your own state on it: solved, partially solved, attempted,
  or untouched. The chip for the problem you are reading is marked. Left and Right arrows move between chips;
- links to Standings, your own Submissions, and Clarifications when they are enabled. Below 700 pixels wide these
  collapse into a menu;
- the live countdown to the end of your participation, which turns amber under five minutes and red under one.
  It reads "ended" once the window has closed, "spectating" when you are watching rather than competing, and
  "open" for a contest with no meaningful end.

The bar renders from the contest in the URL, so it is there on every contest page whether or not you have joined,
and on a problem page for a problem in the contest you are in.

DMOJ's draggable floater box with the countdown still exists for pages that are not part of the contest, such as
your own profile. It is hidden whenever the contest bar is visible, so the countdown is never on screen twice,
and its position is remembered.
