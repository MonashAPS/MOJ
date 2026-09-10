# Screenshots

The screenshots referenced by the root `README.md` and by this documentation site. They live in `docs/public/`, so
a file here is served at `/MOJ/screenshots/<name>` on the documentation site and can be referenced from the root
README by its path in the repository.

## How to take them

- Chromium at 1440 by 900, device pixel ratio 2, so the files are 2880 by 1800 and stay sharp on a high density
  display.
- Dark theme, since that is the site's default appearance, with the light variant only where a page is noticeably
  different in light mode.
- Signed in as a seeded demo account rather than a real one. No real email addresses, no real names, no real
  submissions from members.
- The seeded development data (`npm run setup`) plus a handful of extra problems, users and one finished contest.
  A screenshot of an empty site is worse than no screenshot.
- PNG, optimised with `oxipng -o 4` or similar. Keep each file under about 400 KB.
- Crop to the browser viewport. No window chrome, no bookmarks bar, no operating system furniture.
- Redact nothing after the fact. If something should not be visible, change the data and take it again.

## The set

| File | Page | What it has to show |
| --- | --- | --- |
| `home.png` | `/` | The home page as a signed-in user: the navigation bar with the MOJ wordmark, the announcement or blog area, recent problems and the user block at the top right. This is the first image in the root README, so it is the one that has to look right. |
| `problem.png` | `/problem/<code>` | A rendered statement with maths, a code block and an image: the title row, the tab bar, the statement in the main column, and the info sidebar with the limits, the point value, the author and the "appeared in" line. |
| `submit.png` | `/problem/<code>/submit` | The submit page: the CodeMirror editor with syntax highlighting, the language selector, and the problem's limits beside it. |
| `submission-status.png` | `/submission/<id>` | A submission mid-grade: some cases green, one in progress, the batch structure visible, and the running points. Take it while a real submission is being judged rather than staging it, so the state is honest. |
| `submissions-list.png` | `/submissions/` | The global submission list with its filters open: user, problem, language and result, and rows showing verdict colours, time and memory. |
| `contest-ranking.png` | `/contest/<key>/ranking/` | A finished contest's standings: ranks, the per-problem cells with points and times, the format's cumulative time column, and the contest navigation bar above it. |
| `hall-scoreboard.png` | `/scoreboard/<event>` | The projector board during a freeze: solved, first blood, failed and frozen cells, the badge column, the All and In-person toggle, and the frozen indicator. This is the one that sells the contest tooling, so take it from a real event if there is one. |
| `staff-console.png` | `/admin` | The staff console, on the problems or submissions section: the section navigation, a list with filters and pagination, and the revision reason field visible on an edit form. |
| `accounts-2fa.png` | `/accounts/2fa/` | The two-factor page: the TOTP entry, the scratch codes panel and the registered passkeys, with the codes themselves blurred or replaced by placeholder values in the seed data. |

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

The set is small on purpose. Nine images cover what the site does; a gallery of every page would be a maintenance
job nobody does.
