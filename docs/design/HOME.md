# MOJ home page

The home page keeps DMOJ's information architecture exactly: a left column of blog announcements and a right
column of side boxes. Nothing moves. What changes is that every box becomes a MAPS **panel** (titlebar + framed
body), the announcement becomes a real article card with an author and a proper "read more" affordance, and the
countdowns become live monospace tickers.

Reference for the "before": [`screens/judge-home.png`](screens/judge-home.png).

---

## 1. Composition

```
+==========================================================================================+
| [MAPS]  Problems  Submissions  Contests  Users  Organizations  More v   [Q]  (av) User v | 44px nav (--nav)
+==========================================================================================+ 3px --brand-royal
|                                                                                          |
|  +--- home_page_top slot (misc config) -----------------------------------------------+  |  full width,
|  |  Registration for MCPC 2026 closes Friday.                              [ Read ]   |  |  only if set
|  +------------------------------------------------------------------------------------+  |
|                                                                                          |
|  News                                                          [ RSS ] [ Atom ]          | h1 + actions
|  ----------------------------------------------------------------------------------      | hr
|                                                                                          |
|  +--------------------------------------------------+   +-----------------------------+  |
|  | PIN  Welcome to the MAPS Online Judge             |   | ONGOING CONTESTS       [T] |  |
|  |      by admin . 3 Sept 2026 . 4 comments          |   +-----------------------------+  |
|  |                                                    |   | Week 7: Flows              |  |
|  |      MOJ is where the club's problems and          |   | ends in 01:12:44           |  |
|  |      contests live. Here is how to get started     |   | [======================  ] |  |
|  |      and where to ask for help.                    |   |                    [Enter] |  |
|  |                                                    |   +-----------------------------+  |
|  |      ( read more -> )              [ 4 comments ]  |   | UPCOMING CONTESTS      [C] |  |
|  +--------------------------------------------------+   +-----------------------------+  |
|                                                          | Week 8: Strings            |  |
|  +--------------------------------------------------+   | Thu 17 Sept, 16:20         |  |
|  |      Contest season is open                       |   | starts in 6d 04:11         |  |
|  |      by purqest . 8 Sept 2026 . 0 comments        |   | -------------------------- |  |
|  |                                                    |   | Beginner Contest 2026      |  |
|  |      Weekly contests start this month. Ratings,    |   | Sat 26 Sept, 12:00         |  |
|  |      virtual participation and editorials all      |   | starts in 15d 00:02        |  |
|  |      included.                                     |   |          [ Full calendar ] |  |
|  |                                                    |   +-----------------------------+  |
|  |      ( read more -> )              [ 0 comments ]  |   | RECENT COMMENTS        [M] |  |
|  +--------------------------------------------------+   +-----------------------------+  |
|                                                          | JulianRowse -> Beginner... |  |
|                        [ 1 ] 2  3  >                     | mohanned    -> April Fools |  |
|                                                          | purqest     -> Week 1: ... |  |
|                                                          |                 [RSS][Atom]|  |
|                                                          +-----------------------------+  |
|                                                          | NEW PROBLEMS           [+] |  |
|                                                          +-----------------------------+  |
|                                                          | Trivial              100p  |  |
|                                                          | Nice Words           100p  |  |
|                                                          | Touch Grass          100p  |  |
|                                                          |                 [RSS][Atom]|  |
|                                                          +-----------------------------+  |
|                                                          | TOP USERS              [^] |  |
|                                                          +-----------------------------+  |
|                                                          | 1  emertylover445    2120  |  |
|                                                          | 2  pleeric           2086  |  |
|                                                          | 3  Lucas4732         2081  |  |
|                                                          |            [ Full ranking ]|  |
|                                                          +-----------------------------+  |
|                                                                                          |
+------------------------------------------------------------------------------------------+
|  proudly powered by MOJ . run by Monash Algorithms and Problem Solving      [English v]   | footer
+------------------------------------------------------------------------------------------+
```

Grid: `grid-template-columns: minmax(0, 1fr) var(--sidebar-w)` with `gap: var(--space-6)`, inside
`max-width: var(--content-max)`. Under 960 px the sidebar drops below the announcements in the order
Ongoing -> Upcoming -> New problems -> Top users -> Recent comments (contest information first on a phone).
Under 700 px the side boxes go full width and `--sidebar-w` stops applying, exactly as DMOJ's `.info-float`
collapse does.

---

## 2. `home_page_top` slot

Rendered from the misc config key `home_page_top` (raw HTML through the `flatpage` sanitiser preset), above the
`News` title, full content width, only when the key is non-empty.

- Container: `background: var(--accent-soft)`, `border: 1px solid var(--accent-line)`, `border-left: 3px solid
  var(--brand-royal)`, `border-radius: var(--radius)`, padding `var(--space-3) var(--space-4)`,
  `font-size: var(--fs-base)`, `color: var(--ink)`.
- Links inside inherit `--link`. Any `<h1>`/`<h2>` inside is demoted to `--fs-h3`.
- Dismissible: an `x` at the right stores the content hash in `localStorage` so the same announcement does not
  reappear; a new value shows again. No animation on dismiss beyond a `--dur` opacity fade.

---

## 3. Announcement card (blog post)

One card per post, `--space-4` apart. Sticky posts come first, in the order the server returns.

```
+---------------------------------------------------------------+ --surface, 1px --line,
| [pin] Welcome to the MAPS Online Judge                        |  --radius, --shadow-1
|       admin . 3 Sept 2026 . 4 comments                        |  padding var(--space-4) var(--space-5)
|                                                               |
|       MOJ is where the club's problems and contests live.     |
|       Here is how to get started and where to ask for help.   |
|                                                               |
|       ( read more -> )                        [ 4 comments ]  |
+---------------------------------------------------------------+
```

| Part | Spec |
| --- | --- |
| Card | `background: var(--surface)`; `border: 1px solid var(--line)`; `border-radius: var(--radius)`; **no shadow**; `padding: var(--space-4) var(--space-5)` |
| Sticky card | adds `border-left: 3px solid var(--brand-royal)` and shows the pin icon; **no** different background — the rail is the whole signal |
| Pin icon | Lucide `pin`, 14 px, `--brand-royal`, sitting in the title line, `margin-right: var(--space-2)` |
| Title | `a` -> `/post/[id]-[slug]`; `--font-display` 600, `--fs-h2` (20 px), `letter-spacing: var(--tracking-tight)`, colour `--ink` (**not** blue — the whole card is the link target); on hover the title goes `--link` and the card border goes `--line-strong`, both over `--dur-fast` |
| Byline | one line, `--fs-sm`, `--muted`: author name (rating-coloured, `--font-mono` 500), then `.` then the date, then `.` then "N comments". Dates are absolute (`3 Sept 2026`) with a `title` carrying the full timestamp; anything under 24 h old renders as relative ("4 hours ago") |
| Summary | the post's `summary` field, or the first paragraph truncated at 280 characters; `--fs-base`, `--lh-prose`, `--ink-2`, `max-width: 68ch` |
| read more | a **pill outline button** — this is the one place the club's `.menuButton` shape is quoted directly. `height: var(--control-h-sm)`; `padding: 0 var(--space-4)`; `border-radius: var(--radius-pill)`; `border: 1px solid var(--accent-line)`; `color: var(--accent)`; `background: transparent`; `font-size: var(--fs-sm)`; hover fills `--accent-soft`; the trailing Lucide `arrow-right` (14 px) translates `2px` right over `--dur` (the one sanctioned hover movement) |
| comment count | right-aligned on the same row, Lucide `message-square` 14 px + count, `--muted`, `--fs-sm`, links to the post's comment anchor |
| Card hover | `border-color: var(--line-strong)`; no lift, no scale, no shadow change — dense pages must not bounce |

Empty state: a single dashed panel, `border: 1px dashed var(--line-strong)`, `background: var(--bg-2)`,
centred, `--muted`: "No announcements yet." Staff additionally see a "Write one" secondary button.

Pagination sits under the last card, centred, using the shared Pagination component (section 12 of DESIGN.md).

---

## 4. Side boxes

Every side box is the same **panel**: a titlebar and a framed body. This is the single biggest visual change on
the page and it is a direct modernisation of DMOJ's dark header band plus its right-aligned icon — the same two
pieces of information, restyled into the club's window motif.

```
+-----------------------------+
| ONGOING CONTESTS        [T] |  titlebar: --surface-2, 28px, 1px --line bottom,
+-----------------------------+  label --fs-xs/600/uppercase/--tracking-label/--ink-2,
|  body                       |  Lucide icon 14px --muted at the right
+-----------------------------+
```

- Panel: `background: var(--surface)`; `border: 1px solid var(--line)`; `border-radius: var(--radius)`;
  `overflow: hidden`; **no shadow** — a resting surface is a hairline on a surface (DESIGN.md section 4).
  Boxes are `var(--space-4)` apart.
- Body padding `var(--space-3)`; internal rows separated by `1px solid var(--line)`, never by a shadow.
- A box's footer links (RSS / Atom / "Full ranking") sit on one right-aligned row, `--fs-sm`, `--muted`,
  separated by a thin `--line` rule above.
- The sidebar column is `position: sticky; top: var(--sticky-top)` only when its total height is under the
  viewport; otherwise it scrolls normally.

### 4.1 Ongoing contests

- Contest name: `--font-display` 600, `--fs-h3`, `--link`.
- Countdown: `--font-mono` 500, `--fs-base`, `font-variant-numeric: tabular-nums`, `--ink`. Format
  `HH:MM:SS` under a day, `Nd HH:MM` above. It ticks once a second from a single shared interval, and the
  seconds digit is the only thing that repaints. Label "ends in" in `--fs-xs`/`--muted` above it.
- Progress bar: 4 px, `--surface-3` track, `--brand-royal` fill, full width, `border-radius: var(--radius-pill)`.
  Elapsed fraction of the contest window. Hidden under `prefers-reduced-motion`? No — it is a static width, it
  only changes on the tick; it stays.
- Action: a primary button "Enter" (or "Join") right-aligned, `--control-h-sm`.
- Under 5 minutes remaining the countdown turns `--v-warn`; under 60 seconds `--v-bad`. No flashing.

### 4.2 Upcoming contests

- Rows separated by `--line`. Name (`--link`), then start time (`--fs-sm`, `--muted`, club timezone with a
  `title` giving the viewer's local time), then "starts in Nd HH:MM" in `--font-mono`/`--fs-sm`/`--ink-2`.
- Footer link "Full calendar" -> `/contests/`.
- If both contest boxes are empty they collapse into one panel titled `CONTESTS` whose body is the empty state
  "Nothing scheduled." plus a link to past contests.

### 4.3 Recent comments

- One row per comment, `--fs-sm`, `--lh` 1.35: the author (rating-coloured, `--font-mono` 500), a Lucide
  `chevron-right` 12 px in `--muted`, then the target's title as a `--link`, truncated to two lines with
  `-webkit-line-clamp: 2`.
- 10 rows, `var(--space-2)` vertical padding each, no separators between them (the pairs read as a stream).
- Footer: RSS / Atom.

### 4.4 New problems

- Row: problem name (`--link`, truncated to one line, `text-overflow: ellipsis`) on the left, points on the
  right in `--font-mono`/`--fs-sm`/`--muted` with a `p` suffix.
- If the viewer is logged in, a 14 px state icon precedes the name using the same icons and
  `--state-*` colours as the problem list (`check-circle-2` solved, `circle-dashed` attempted, nothing for
  untouched — never a red icon here, this box is an invitation).
- 7 rows. Footer: RSS / Atom.

### 4.5 Top users by PP

- Three-column row: rank (`--font-mono`, `--muted`, `--fs-sm`, right-aligned, fixed 2 ch), username
  (rating-coloured, 500 weight, `--link` on hover only), points (`--font-mono`, tabular-nums, `--ink-2`,
  right-aligned).
- The viewer's own row, if they are in the top 10, gets `background: var(--row-selected)` and their username in
  700. If they are not, an 11th row appears after a `--line` rule showing their own rank and points, in
  `--muted`, prefixed with a `...` row — the same trick the contest ranking uses.
- 10 rows at `--row-h-dense` (28 px). Footer: "Full ranking" -> `/users/`.

---

## 5. Motion on this page

Announcement cards fade and rise on first paint only: `opacity 0 -> 1`, `translateY(6px -> 0)`, `--dur-slow`,
`--ease-out`, staggered `min(i * 40ms, 300ms)`, and never replayed on client navigation. The reveal is guarded
by `useSeen` so a card can never be stranded invisible after a fast scroll. Side boxes do not animate in — they
hold the layout still while the left column settles. Countdowns update text only, from one shared interval.
Nothing on this page moves on hover; the "read more" arrow may nudge 2 px. Under `prefers-reduced-motion` the
transform is dropped and the cards fade only.

---

## 6. What stays exactly where DMOJ put it

- Announcements left, side boxes right.
- Sticky posts first, then reverse chronological.
- Author, date and comment count on every post; "read more" at the bottom-left of the post body.
- Ongoing contests above upcoming contests, above the comment stream, above new problems, above top users.
- RSS/Atom pairs in the comment-stream and new-problems boxes.
- `home_page_top` above everything in the content column.
- Footer: "proudly powered by MOJ", the misc-config footer text, and the language `<select>` — which becomes a
  Radix Select, the one visual change in the footer.
