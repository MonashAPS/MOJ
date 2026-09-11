# Screenshots

The screenshots the root `README.md` and this documentation site use. They live in `docs/public/`, so a file here
is served at `/MOJ/screenshots/<name>` on the documentation site and is referenced from the root README by its
path in the repository.

## How to take them

- Chromium driven by Playwright against a running site, not a mock. A screenshot of an empty site is worse than
  no screenshot, so take them against real data.
- 1440 px wide at a device pixel ratio of 1, with the viewport height cropped to the end of the content. The two
  hall scoreboard images are 1920 by 1080, because that is what a projector gets.
- The light theme, except for the hall scoreboard, which has its own dark palette, and `dark-home.png`.
- Signed out where the page looks the same either way, and signed in as a staff account for the pages that need
  one. No email addresses, nothing from `/admin/users/`. Usernames and public data are fine.
- PNG, optimised with `oxipng -o 4 --strip safe`. Keep each file under about 400 KB.
- Crop to the browser viewport. No window chrome, no bookmarks bar, no operating system furniture. Hide the
  development server's overlay with `nextjs-portal { display: none }`.
- Redact nothing after the fact. If something should not be visible, change the data and take it again.

## The set

| File | Page | What it has to show |
| --- | --- | --- |
| `home.png` | `/` | The news page signed out: the navigation bar, the announcements, and the ongoing contest and recent comment boxes. This is the first image in the root README, so it is the one that has to look right. |
| `problem.png` | `/problem/<code>` | A statement with maths, an image and sample data, plus the info box with the limits, the point value, the solver counts and the author. |
| `problem-list.png` | `/problems/` | The problem list with the filter panel open beside it. |
| `submit.png` | `/problem/<code>/submit` | The submit page with a real solution in the editor, the language selector, and the problem's limits beside it. |
| `submission-status.png` | `/submission/<id>` | A graded submission with its batches, its cases and the checker's feedback per case. |
| `submissions.png` | `/submissions/` | The global submission list with the filters and the verdict statistics. |
| `contest.png` | `/contest/<key>/` | A contest page: the contest bar, the problem table, the schedule and scoring boxes, and a clarification. |
| `contest-ranking.png` | `/contest/<key>/ranking/` | A ranking with real rows: the per problem cells, the times and the format's tiebreak column. |
| `hall-scoreboard.png` | `/scoreboard/<event>` | The projector board during a freeze: solved, first blood, failed and withheld cells, the division switcher and the legend. |
| `hall-scoreboard-reveal.png` | `/scoreboard/<event>` | The same board in reveal mode, with the reveal bar and the row being turned over. Drive the reveal, then undo every step, so the board is left as it was found. |
| `user.png` | `/user/<name>` | A profile: the point total and rank, the year of submission activity, and the best submissions table. |
| `admin-problem.png` | `/admin/problems/<code>/` | The staff console on a problem: the rail, the tab bar and the edit form. |
| `admin-contest.png` | `/admin/contests/<key>/?tab=problems` | A contest's problems in the console, with their labels, points and submission limits. |
| `two-factor.png` | `/accounts/2fa/` | The two factor page: the authenticator app, the scratch codes and the passkeys. |
| `dark-home.png` | `/` | The home page in the dark theme. |

## Referencing them

From the root README, by repository path:

```markdown
![The MOJ home page](docs/public/screenshots/home.png)
```

From a documentation page, by URL, since VitePress serves `public/` at the base:

```markdown
![The MOJ home page](/screenshots/home.png)
```

## Keeping them current

Retake the set when the page skeleton or the design tokens change. A screenshot that shows a layout the site no
longer has is worse than none, because it is the first thing a new contributor believes.

The set is small on purpose. A gallery of every page is a maintenance job nobody does.
