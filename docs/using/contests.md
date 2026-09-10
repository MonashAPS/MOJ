# Contests

A contest is a set of problems with a start time, an end time and a scoring format. Everything else, the ranking
page, the freeze, ratings, virtual participation and the hall scoreboard, is built on those four things.

Contests live at `/contest/<key>`, their standings at `/contest/<key>/ranking/`, and the list at `/contests/`. The
key follows the same rules as a problem code: lowercase, unique, permanent once the contest has run.

## Formats

The format decides how a set of submissions becomes a score and how ties are broken. Pick it when you create the
contest; changing it afterwards means a rescore. Each format takes a small JSON configuration, edited beside the
format name in the staff console.

### Default

The score is the sum of the highest-scoring submission on each problem. Ties break on cumulative time, which is
the sum of the times of the last submission to each problem with a non-zero score.

Every submission moves the tiebreaker, not only the ones that change the score, so a contestant who resubmits after
already being correct is penalised. There is nothing to configure. This is the right format for a training round
where the score is what matters and the tiebreaker rarely decides anything.

### IOI

`ioi16` is the modern IOI rule: the score for a problem is the best score achieved on **each subtask** across all
submissions, added up. Two submissions that solve different subtasks combine, so a contestant who scores 30 on
subtask 1 in one submission and 40 on subtask 2 in another ends with 70 for the problem.

Ties are not broken by default. Set `cumtime` to `true` in the configuration to break them by the sum of the
submission times of the first submission that passed each subtask.

### Legacy IOI

`ioi` is the older Codechef IOI ranklist rule: the score for a problem is the score of the single best submission,
with no combining across subtasks. A contestant who scores 30 in one submission and 40 in another ends with 40, not
70.

Ties are not broken by default; `cumtime: true` breaks them by the times of the most recent score-changing
submissions. Use this only for compatibility with contests that were run this way.

### AtCoder

The score is the sum of the highest-scoring submission on each problem. Ties break on the time of the last
score-changing submission plus a penalty.

The penalty is the number of incorrect submissions before the highest-scoring submission on each solved problem,
multiplied by the `penalty` configuration value, which is 5 minutes by default. Unlike Default, submissions that do
not change the score do not add time; only the wrong ones add penalty.

### ICPC

The score is the number of problems solved. Ties break first on total penalty time, then on the time of the last
score-changing submission. `penalty` defaults to 20 minutes. This is described in full below, because it is the
format the club's contests use and the one the hall scoreboard always applies.

### ECOO

The score is the sum of the score of the **last** submission to each problem, not the best. A contestant who solves
a problem and then breaks it while trying to optimise keeps the broken score.

Two bonuses on top. `first_ac_bonus`, 10 by default, adds that many points to a problem solved on the first
attempt, ignoring compile errors and internal errors. `time_bonus`, 5 by default, adds one point per whole interval
of that many minutes remaining when a submission with a non-zero score is made; a 50 point submission made 23
minutes before the end gets 4 bonus points, for 54. Setting `time_bonus` to 0 disables it. `cumtime: true` breaks
ties by the times of the last submission to each problem.

## ICPC rules in detail

A problem counts once, when it is first accepted. Later submissions to a solved problem change nothing, neither
score nor penalty.

The penalty for a solved problem is:

```
minutes from the participation start to the accepted submission
  + penalty_minutes * (number of rejected submissions before it)
```

where `penalty_minutes` is 20 unless the contest configures otherwise. A submission counts as rejected if it has
any non-accepted result other than compile error, internal error or aborted. Compile errors are free, which is
deliberate: a typo is not a wrong idea.

Unsolved problems contribute no penalty at all, however many attempts they took. There is never a reason to leave a
problem alone at the end of an ICPC contest.

Ranking is:

1. problems solved, descending;
2. total penalty, ascending;
3. time of the last accepted submission, ascending.

Contestants who tie on all three share a rank. On the hall scoreboard they are drawn on the same row height with
the same rank number, rather than being ordered arbitrarily.

Times are measured from the participation's own start, which for a virtual participant is when they started, not
when the contest did.

## Freeze and blind mode

A frozen scoreboard is what makes the end of a contest worth watching. Set `freezeMinutes` on the contest and the
public board stops updating that many minutes before the end.

- Submissions made after the freeze point show as pending rather than as a verdict, on `/contest/<key>/ranking/`
  and on the hall scoreboard alike.
- Rankings during the freeze are computed from pre-freeze data only, so the order shown is the order as of the
  freeze.
- Contest editors, and anyone listed in the contest's "can see scoreboard" list, always see the real board.
- Virtual participants are never frozen. They are running their own clock, and their board is only theirs.
- `freezeMinutes: 0` disables the freeze.

By default a contestant still sees their own verdicts during the freeze, which is DMOJ's behaviour: the board is
frozen but you know whether your own last submission passed. Setting `blindDuringFreeze` makes it stricter: the
contestant's own submission rows and per-case views show pending until the contest ends. That is the ICPC world
finals rule, and it is what the club uses for the on-site contest. Staff see everything either way.

After the end time the board stays frozen until someone unfreezes it. There are two ways:

- **Reveal**, stepwise from the bottom of the board upward, one cell at a time, with undo. This is the ceremony,
  driven from the hall scoreboard.
- **Unfreeze**, which drops the freeze entirely and shows the final board at once.

Nothing expires the freeze on its own, so a contest whose staff go home stays frozen until they come back. That is
deliberate: an accidental reveal cannot be undone in front of an audience.

## The hall scoreboard

`/scoreboard/<event>` is a separate, projector-shaped board for a live event. It is configured by a
`scoreboardEvents` document in the staff console rather than by a contest, because an event can be several
contests at once.

It differs from the contest ranking page in two ways worth knowing before you use it. It always applies ICPC
scoring, whatever formats the underlying contests use, so a scoring contest and a solved-count contest can share a
board. And it ignores each contest's `scoreboardVisibility`, because its whole purpose is to drive a display for a
contest whose own ranking page is hidden from entrants. Treat the URL as public from the moment the event exists.

### Divisions

An event lists several contests. Each becomes a division with its own panel, and the page shows one at a time with
a carousel. Divisions keep their own freeze state, their own first blood and their own ranking.

### Badges and attendance

Badges come from organisation membership. An event names organisation slugs, and every competitor in one of those
organisations gets that badge beside their name, labelled with the organisation's short name unless the event
overrides the label.

One badge is special: the event's `inPersonOrganizationSlug` marks who is in the room. That drives the **All** and
**In-person** toggle, which filters the board down to the people who are physically present, which is the ranking
the audience cares about. The in-person badge itself is hidden from rows when the filter is on, since it would be
on every row.

### Cell states

| State | Meaning |
| --- | --- |
| Solved | Accepted. Shows the attempt count and the minute. |
| First | The first solve of that problem in that division, highlighted. |
| Failed | Attempted, not solved. Shows the attempt count. |
| Frozen | Attempted after the freeze point, outcome not shown. |
| Judging | A submission is being graded right now. |
| Empty | No submissions. |

The board is a reactive query, so cells change as verdicts land. There is no refresh button because there is
nothing to refresh.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Left and Right arrows | Previous and next division |
| P | Start or stop the automatic tour, which scrolls each division top to bottom and moves on |
| F | Show or hide the event feed, the sidebar of recent submissions |
| I | Switch between All and In-person, when the event has an in-person organisation |
| E | Badge editing mode, for staff, to fix someone's badges mid-contest |
| R | Enter the reveal ceremony, for staff |

Inside the reveal: Space, Right arrow or Enter steps forward one cell, Left arrow or Backspace undoes the last
step, and Escape leaves without finishing.

### The reveal ceremony

The reveal walks the frozen board from the bottom row upward. Each step resolves the next frozen cell, the row
re-sorts if it moved, and the next target is highlighted before it is resolved so the room can react. Undo steps
back one cell at a time, which is what you want when someone jumps the gun on the projector.

The reveal only runs for staff, and only while frozen cells remain. When the last one is resolved, the board is
final.

### Themes

`default` is the plain projector board. `olympics` replaces problem labels with sport pictograms and gives the
first solve of each problem a gold medal. A theme only restyles; the data, the shortcuts and the reveal behave the
same. An event with no theme key gets the default.

An event can also give every competitor a small flag beside their name, from a URL template such as
`/media/flags/{username}.png`. A competitor whose image is missing simply has no flag, rather than a broken image.

## Ratings

Rated contests move a rating, using Elo-MMR, which is the system DMOJ moved to and the one the imported ratings
came from. Ratings are stored per participation, so a user's rating history is the list of contests they were rated
in.

Rating happens when a staff member rates the contest, not automatically at the end, so a contest with a
disqualification to sort out can be rated after it is sorted. Rating a contest re-rates every contest after it in
time order, because each contest's result depends on the ratings going in.

| Setting | What it does |
| --- | --- |
| `isRated` | Whether the contest can be rated at all. |
| `rateAll` | Rate everyone who joined, rather than only those who submitted. |
| `ratingFloor`, `ratingCeiling` | Only rate participants whose rating going in is inside this range. A newcomer counts as 1200 for this check. |
| `performanceCeilingOverride` | Cap the performance a contest can award, for a contest whose field is not representative. |
| `rateExcludeProfileIds` | Individuals not to rate, for staff who competed unofficially. |

Rating classes, by rating: Newbie below 1000, Amateur 1000 to 1299, Expert 1300 to 1599, Candidate Master 1600 to
1899, Master 1900 to 2399, Grandmaster 2400 to 2999, Target 3000 and above. The class is the colour a username is
drawn in across the site.

Disqualifying a participation sets its score aside and, if the contest is rated, treats it as a loss for rating
purposes, following DMOJ.

## Joining, spectating and virtual participation

There are three ways to be in a contest, and they are different rows in `contestParticipations` distinguished by
the `virtual` field.

**Live** (`virtual = 0`) is joining while the contest is running. The clock is the contest's clock, or, for a
windowed contest with a `timeLimit`, a personal window that starts when you join. Live participation is what gets
rated.

**Spectating** (`virtual = -1`) is for staff and for anyone with permission to watch. A spectator sees the
problems and can submit, but is not on the scoreboard and is not rated. Contest authors, curators and testers
spectate rather than participate.

**Virtual** (`virtual = n > 0`) is running a finished contest against its clock afterwards. The participation gets
its own start time, the timer runs from there, and the ranking page can show the virtual run against the original
field. Virtual participants are never affected by the freeze, are never rated, and can start a virtual run any
number of times; `n` counts them.

While a participation is live, the site is in **contest mode**: the problem list shows only the contest's problems,
submission lists are filtered to the contest, `/users/` shows the contest scoreboard instead of the global one,
editorials are hidden and problem voting is disabled. Leaving the contest, or its window ending, clears it. A cron
clears stale contest mode for participations that ended without anyone leaving.

## Access control

Contests stack several independent restrictions. A user has to pass all of them.

- **Visibility.** `isVisible` off means only editors can see the contest exists. This is the state a contest should
  be in while it is being written.
- **Access code.** A contest with an `accessCode` asks for it on join. It is a shared secret typed by everyone in
  the room, not an invitation; anyone with the code can join.
- **Private to users.** `isPrivate` with a list of allowed contestants. Only those users can join.
- **Private to organisations.** `isOrganizationPrivate` with a list of organisations. Members of those
  organisations can join. This is how a contest is restricted to the club without a shared code.
- **Join restrictions.** `limitJoinOrganizations` narrows which organisation a member has to be in to join, and
  `classIds` narrows further to specific classes within an organisation.
- **Banned users.** `bannedProfileIds` blocks specific people from joining regardless of everything else.

Scoreboard visibility is separate from all of that: `scoreboardVisibility` is Visible, visible after the
Contest ends, visible after your own Participation ends, or Hidden. The hall scoreboard ignores it.

## Locking

`lockedAfter` freezes a contest's submissions at a point in time. After it, submissions to the contest's problems
from participants cannot be judged or rejudged, and their sources cannot be edited. It exists so that a contest
being used for assessment can be sealed while the marking is checked, and it is separate from the scoreboard
freeze: a locked contest can have a fully public board.

Locking requires the `judge.lock_contest` permission.

## Clarifications

With `useClarifications` on, contestants can ask questions from the contest page and staff answer them. An answer
is either private to the asker or published to everyone in the contest, and published answers appear in the
contest problem's clarification list. Clarifications are live, so an answer reaches every open contest page at
once.

## The contest navigation bar

While you are in contest mode, or on any page that belongs to a contest, a second bar renders under the main
navigation:

- the contest name, linking to the contest page;
- one chip per problem, showing its label (A, B, C and so on), coloured by your own state on it: solved, attempted,
  or untouched;
- links to Standings, your own Submissions, and Clarifications when they are enabled;
- the live countdown to the end of your participation.

On a problem page inside a contest, the title row shows a breadcrumb of the contest name and the problem's label,
and the end of the statement has previous and next problem links, so you can move through the set without going
back to the contest page. The bar is keyboard reachable, so tabbing through it works during a contest where the
mouse is a nuisance.

DMOJ's draggable floater box with the countdown still exists for pages that are not part of the contest, such as
your own profile. It is hidden whenever the contest bar is visible, so the countdown is never on screen twice.

Contest pages also list each problem with its public solve count, which is a quick read on which problems the field
found hard.
