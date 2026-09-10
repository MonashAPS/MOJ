# MOJ design system

MOJ is DMOJ's information architecture wearing MAPS' clothes. Every page keeps DMOJ's structure, its route, its
column layout and the position of every control, because members already know where things are and because the
import brings DMOJ's data shapes with it. Everything you can see — colour, type, density, shape, motion and the
controls themselves — is replaced with the design language the club already uses on
[monashaps.com](screens/maps-home-desktop.png) and [advent.monashaps.com](screens/maps-advent.png), built to the
same standard as the rest of the author's front ends.

This is not a re-skin of DMOJ's stylesheet. DMOJ's near-black header bands, its saturated verdict blocks, its
native form controls, its 1.5 px-per-row Bootstrap-era tables and its jQuery UI leftovers all go.

**Before / after references.** The screenshots in [`screens/`](screens/) are the current
`judge.monashaps.com` (a DMOJ 4.x fork) and the club's own sites. Read them as "before":

| File | What it shows |
| --- | --- |
| [`screens/maps-home-desktop.png`](screens/maps-home-desktop.png) | monashaps.com hero: royal chrome, canary pills, mono body |
| [`screens/maps-home-sections.png`](screens/maps-home-sections.png) | the club's bone ground, framed "window" panels, full-bleed royal bands |
| [`screens/maps-home-mobile.png`](screens/maps-home-mobile.png) | the club's mobile treatment |
| [`screens/maps-advent.png`](screens/maps-advent.png) | Advent of MAPS: the same window motif taken to its extreme |
| [`screens/judge-home.png`](screens/judge-home.png) | current home: dark bands, no hierarchy |
| [`screens/judge-problems.png`](screens/judge-problems.png) | current problem list and its search box |
| [`screens/judge-problem.png`](screens/judge-problem.png) | current problem page: title row, info-float, sample blocks |
| [`screens/judge-submissions.png`](screens/judge-submissions.png) | current submission list: saturated status blocks |
| [`screens/judge-contests.png`](screens/judge-contests.png) | current contests list |
| [`screens/judge-contest.png`](screens/judge-contest.png) | current contest page: tab bar + primary action |
| [`screens/judge-users.png`](screens/judge-users.png) | current leaderboard |
| [`screens/judge-problems-mobile.png`](screens/judge-problems-mobile.png) | current mobile problem list |

---

## 1. Where the language comes from

Two club sites, one language.

**monashaps.com** (`MonashAPS/homepage`, CRA + plain CSS). `--main-colour: #4169E1` royal, `--dark-bg: #000080`
navy, `--accent: #FFFF8F` canary, `--bg: #F9F6EE` bone, `--dark-text: #2B2B2B`. Body set in JetBrains Mono;
display type in Jersey 25 and Space Mono with heavy negative tracking (`letter-spacing: -2px` / `-0.08em`); a
faint royal grid ruled over the bone ground (`linear-gradient(#6569d11f 2px, transparent 2px)` at 50 px); nav
items are **outlined pills** (`border-radius: 100px`, canary on royal, filling on hover); panels are framed
"windows" with a titlebar and a hard offset shadow (`box-shadow: 0 5px 5px`); full-bleed royal bands carry
tight, heavy display type.

**advent.monashaps.com** (`MonashAPS/adventofmaps`, React Router + Prisma). A deliberate Windows-95 skin, so its
chrome is not a model — but it contributes the same window metaphor (titlebar, framed body, offset shadow) and a
usable status palette: gold `#F8CA50` / `#B08100`, red `#D04134`, green `#A9DC76`.

**The MOJ logo** (`apps/web/public/logo.svg`) is a white "MAPS" wordmark in Bai Jamjuree beside a mark filled
with a `#006EAE -> #45C3F1` gradient. The wordmark must sit on a dark ground; that constrains the nav.

**The through line.** Royal blue and navy; bone rather than grey; monospace for anything that is data; framed
panels with an explicit titlebar; pills for chips and rectangles for everything else; heavy display type with
tight tracking. That is the whole language, and every rule below is derived from it.

### 1.1 The quality bar

The club's two sites give MOJ its *palette and motifs*. The standard it has to be **built** to comes from the
author's own front ends, which were read for this document and which agree with each other on far more than
they disagree:

| Repo | What it contributes |
| --- | --- |
| `monashcoding-site` | The sibling club site. One easing curve applied religiously (`cubic-bezier(.22,1,.36,1)`), depth by surface-lightness and hairlines rather than shadow, the uppercase micro-label system, `layoutId` shared-element pills, fluid `clamp()` display type |
| `OrderRegistration` | A complete Radix + Tailwind v4 shadcn kit — the base for `packages/ui` (section 11), plus the `data-slot` architecture and the `form.tsx` ARIA wiring |
| `thebasinshop` / `kheub` | Editorial discipline: zero-shadow surfaces, hairline-and-value depth, a one-way `useSeen` reveal guard, capped staggers, per-property transitions, reduced-motion that changes the *layout* and not just the timing |
| `swoftyclub` | The closest analogue — a dense app UI. Row-height ladders, `min-h-0` everywhere in the shell, capped results panels, a centralised status-tone table, chrome that yields to the work surface, written loading and empty states |
| `maestros-music-academy` / `bathroom-store` | The production house style: skeletons in the real grid shape, `{ passive: true }` rAF scroll listeners with hysteresis, the `--header-height` custom property, wrapper-framed tables, hairline filter groups, and — in the newest work — the deliberate removal of hover lifts and drop shadows |

Three things these repos get wrong are fixed here rather than copied: **focus rings** (mostly absent in the
marketing sites — MOJ has one ring, everywhere, section 11.3), **reduced motion** (partial in every one of them
— MOJ's is complete, section 5.2), and **keyboard support** (absent in the dense app — MOJ ships a palette and
a shortcut layer, section 17.3).

---

## 2. Palette

Three brand constants are fixed in both themes and only ever appear on the navy chrome or as a keyline; they are
never text on a light ground:

| Token | Hex | Role |
| --- | --- | --- |
| `--brand-royal` | `#4169E1` | the club's royal. The 3 px rule under the nav, the focus ring, the sticky-post rail, progress fills |
| `--brand-navy` | `#000080` | the club's navy. Seed for `--nav`; not used raw |
| `--brand-canary` | `#FFFF8F` | the club's canary. The nav's single CTA, and the "in contest" marker |
| `--brand-bone` | `#F9F6EE` | the club's page ground. Seed for `--bg-2` |
| `--brand-cyan` | `#45C3F1` | the logo gradient's light stop. Judge/queue and info accents |

### 2.1 Light

| Token | Hex | Role |
| --- | --- | --- |
| `--nav` | `#101A3D` | **MAPS navy.** Fixed 44 px top bar |
| `--contest-bar` | `#182448` | ContestBar, one step off the nav |
| `--accent` | `#2F4FD0` | royal darkened to 6.65:1 on white. Primary fills, active tab rule |
| `--accent-hover` / `--accent-active` | `#263FAB` / `#1F3489` | |
| `--accent-soft` / `--accent-line` | `#E7EBFB` / `#C3CDF5` | tinted fills and their borders |
| `--bg` | `#FFFFFF` | default content and control fill |
| `--bg-2` | `#FFFFFF` | **page ground.** Plain white. Panels are separated from it by their hairline and their titlebar, not by a tint |
| `--surface` | `#FFFFFF` | panels, cards, table bodies |
| `--surface-2` | `#F0EEE6` | wells, chips, segmented controls, inactive tabs |
| `--titlebar` / `--titlebar-ink` / `--titlebar-ink-2` | `#101A3D` / `#F2F4FA` / `#A9B4D8` | **every panel titlebar and every table header band.** The chrome's own navy, so a home side box and a list page's table read as the same object |
| `--surface-3` | `#E4E1D7` | wells, tracks, disabled fills |
| `--ink` / `--ink-2` / `--muted` | `#191C22` / `#4B525C` / `#6C7480` | primary / secondary / tertiary text (all >= 4.8:1 on white) |
| `--line` / `--line-strong` | `#E2DFD5` / `#C8C4B7` | hairlines / frames and input borders |
| `--code-bg` | `#F5F3EC` | code blocks, sample cases |
| `--row-zebra` / `--row-hover` | `#FAF9F5` / `#EEF1FC` | zebra warm, hover royal |
| `--link` / `--link-hover` | `#2B4ACB` / `#1B3299` | body links, 7.1:1 on white |

### 2.2 Dark

Dark mode is navy-tinted, not neutral grey — the same family as the chrome.

| Token | Hex |
| --- | --- |
| `--nav` / `--contest-bar` | `#141C33` / `#1A2340` (lifted off the page so the bar still reads as chrome) |
| `--accent` | `#8FA6FF` (7.9:1 on `--bg-2`), `--accent-ink` `#0B1026` |
| `--bg` / `--bg-2` | `#141A28` / `#0D111C` |
| `--surface` / `--surface-2` / `--surface-3` | `#141A28` / `#1C2434` / `#273044` |
| `--titlebar` / `--titlebar-ink` / `--titlebar-ink-2` | `#1E2748` / `#E6EAFA` / `#A3ADCF` (lifted off `--surface` so the band still reads as chrome) |
| `--ink` / `--ink-2` / `--muted` | `#E6E9F0` / `#AAB3C2` / `#8590A2` |
| `--line` / `--line-strong` | `#262F41` / `#3A4459` |
| `--link` | `#93A9FF` |

The nav stays dark navy in both themes. The white wordmark needs it, and the club's chrome is dark by identity.

### 2.3 Verdicts

Five families, then per-verdict aliases, so a pill needs only `--v-<x>` (text) and `--v-<x>-bg` (fill).

| Family | Light | Dark | Verdicts |
| --- | --- | --- | --- |
| `--v-good` | `#17804A` on `#E6F2E8` | `#52C98A` on `#10271B` | AC, SC |
| `--v-bad` | `#C23B2E` on `#FAE7E4` | `#F0776A` on `#2C1512` | WA |
| `--v-warn` | `#9A6B08` on `#FBF2DC` | `#F8CA50` on `#2C2410` | OLE, IR, RTE, partial |
| `--v-neutral` | `#6C7480` on `#EEECE4` | `#97A0AE` on `#1F2634` | TLE, MLE, CE, AB, QU |
| `--v-run` | `#2F4FD0` on `#E7EBFB` | `#8FA6FF` on `#1B2447` | queued, judging, pending |

`--v-ie` (Internal Error) is a darker red (`#8E1F14` / `#FF9A8E`) drawn with a **dashed** border so it is never
mistaken for a WA. The dark-mode `--v-warn` is literally advent.monashaps.com's highlight gold.

Verdict colour is never the only signal: every pill carries its two- or three-letter code, and the submission
list also carries a score.

### 2.4 Ratings

DMOJ's hues are a cross-site convention, so they are kept — but at DMOJ's exact values several of them fail as
text on white (`#00A900` is 3.15:1). Light mode uses hue-preserving darkenings; dark mode restores the canonical
brights.

| Class | DMOJ | MOJ light | MOJ dark |
| --- | --- | --- | --- |
| unrated / newbie | `#999999` | `#6C7480` | `#A6ADB8` |
| amateur | `#00A900` | `#0B8022` | `#3BC957` |
| expert | `#2F8ECC` | `#1F72AC` | `#5FB3E8` |
| candidate master | `#A44FBF` | `#8C3BA6` | `#C58BDA` |
| master | `#FFB100` | `#8A6100` | `#FFB100` |
| grandmaster | `#EE0000` | `#C21A1A` | `#FF5B5B` |
| target | `#700000` | `#7A0000` | `#FF8A8A` |

Rating colour applies to the username glyphs only, at weight 500, in `--font-mono`. Target keeps DMOJ's
red-ring treatment (a 1 px `--rating-target` ring around the avatar), not a rainbow.

### 2.5 Heatmap

The submission heatmap is built on the club's green `#A9DC76` rather than GitHub's:
`--heat-0 #E8E5DB`, `--heat-1 #D3ECB8`, `--heat-2 #A9DC76`, `--heat-3 #6BAE44`, `--heat-4 #2F6B25`.
Dark inverts the ramp so the brightest step *is* `#A9DC76`.

---

## 3. Typography

Three faces, all self-hosted under `apps/web/public/fonts` (no Google Fonts at runtime, no FOUT — `font-display:
swap` with a metric-compatible fallback stack).

| Role | Face | Weights | Why |
| --- | --- | --- | --- |
| Display: `h1`–`h3`, panel titles, the wordmark, big numbers | **Bai Jamjuree** | 600, 700 | already decided, and it is the face the logo is drawn in |
| Body and UI | **IBM Plex Sans** | 400, 500, 600 (+400 italic) | reads at 14 px in dense tables, has the language coverage a judge needs, and is the sibling of the mono |
| Code and all data | **JetBrains Mono** | 400, 500, 700 | **the club's own mono** — monashaps.com sets its entire body in it. IBM Plex Mono stays in the stack as the vendored fallback until the JetBrains files land |

> Action for the foundation agent: add JetBrains Mono 400/500/700 (latin + latin-ext) to
> `infra/scripts/fetch-fonts.mjs` and `packages/ui/src/fonts.css`. `--font-mono` already lists it first with
> IBM Plex Mono behind it, so nothing breaks before then.

**The mono is the club signal.** monashaps.com is monospace from top to bottom; a judge cannot be, because
statements and prose need a proportional face. So MOJ carries the club's voice by putting JetBrains Mono on
*everything that is data*: problem codes, points, scores, verdict codes, run time, memory, submission ids, dates
and countdowns, rating numbers, rankings, language names, judge names, and every number in every table — all with
`font-variant-numeric: tabular-nums`. Prose is Plex Sans. Nothing in between.

### 3.1 Scale

| Token | Size / line-height | Used for |
| --- | --- | --- |
| `--fs-xs` | 11 / 16 | panel titlebars (uppercase, `--tracking-label` 0.06em), verdict pills, table micro labels |
| `--fs-sm` | 12.5 / 18 | secondary row text, bylines, captions, help text |
| `--fs-base` | 14 / 20 (`--lh` 1.45) | all UI and table text |
| `--fs-mono` | 13 | mono runs large; step it down wherever it sits beside 14 px sans |
| `--fs-md` | 16 / 26 (`--lh-prose` 1.65) | statement and blog body |
| `--fs-h3` | 16, display 600 | box titles, statement sub-headings |
| `--fs-h2` | 20, display 600, `-0.015em` | section headings |
| `--fs-h1` | 26, display 700, `--tracking-tight` -0.02em, `--lh-tight` 1.2 | the page title in the title row |

DMOJ's `h1` is 2.6em (~36 px) and its `h2` 1.9em. Both come down: a judge's page title is a label, not a
billboard. The club's *taste* for oversized display type is spent where it belongs — the login page wordmark,
contest hero countdowns and the hall scoreboard — never above a table.

Prose measure is capped at `--prose-max` 74ch. Headings never wrap orphans: `text-wrap: balance` on `h1`/`h2`,
`text-wrap: pretty` on paragraphs.

### 3.2 Tracking scales with size

Negative tracking on display type, positive tracking on micro-labels, nothing in between. The ladder, which is
the same shape the author's other front ends use:

| Size | `letter-spacing` |
| --- | --- |
| 26 px `h1` | `-0.02em` |
| 20 px `h2` | `-0.015em` |
| 16 px `h3` | `-0.01em` |
| 14 px UI | `-0.005em` |
| 12.5 px and below, sentence case | `0` |
| micro-labels (uppercase) | `+0.12em`, or `+0.2em` on a vertical rail |

Bai Jamjuree headings are set at 600 for `h2`/`h3` and 700 for `h1` only. Nothing in the product is set in a
weight above 700, and nothing between 600 and 700 exists in the vendored files — do not synthesise one.

### 3.3 The micro-label

One class, `.label`, is the only small-caps device in the product. It is the single recipe that does the most
for the "designed" impression, and it is exactly the recipe the club's other sites use:

```css
.label {
  font-family: var(--font-body);
  font-size: var(--fs-xs);          /* 11px */
  font-weight: 600;
  letter-spacing: var(--tracking-label);   /* 0.12em */
  text-transform: uppercase;
  color: var(--ink-2);
}
```

Documented overrides, and only these: `.label.rail` (`--tracking-rail`, for a vertical `writing-mode: vertical-rl`
strip), `.label.tight` (`0.08em`, inside a 24 px-tall panel titlebar where 0.12em would overflow), and
`.label.on-dark` (`color: var(--contest-bar-ink)`). Everywhere else, `.label` unmodified. Ad-hoc
`uppercase text-xs tracking-wide` is not allowed.

### 3.4 Dense sizes are not the prose sizes

Table and chrome text uses half-pixel sizes where the whole-pixel step is wrong: `13.5px` (dense table cells),
`12.5px` (`--fs-sm`, secondary row text), `11.5px` (score fractions, judge names), `11px` (`--fs-xs`, pills and
labels). A judge that only ever uses 12/14/16 reads as a Bootstrap admin panel. Prose keeps the whole steps.

---

## 4. Spacing, shape, borders, elevation

**Spacing** is a 4 px scale: `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64. Page
gutters are `--gutter` 16 px under 760 px and `--gutter-lg` 24 px above. Sections inside a page are `--space-6`
apart; items in a list `--space-4`; label to control `--space-1`.

**Density** is a first-class token, because a judge is a data tool: `--row-h` 34 px (one-line table rows),
`--row-h-2` 52 px (two-line rows), `--row-h-dense` 28 px (rankings, staff console), `--control-h` 32 px,
`--control-h-sm` 26 px. DMOJ's problem rows are ~29 px with 13 px text; MOJ's are 34 px with 14 px text — more
readable and only ~17% taller, so a screenful still shows ~30 problems.

**Radius.** `--radius-sm` 2 px (pills inside dense rows), `--radius` 4 px (buttons, inputs, panels, cards),
`--radius-lg` 8 px (dialogs, command palette), `--radius-pill` 999 px (chips, badges, the nav CTA, "read more").
Pills are for *things that are values* — a verdict, a tag, a contest problem letter. Rectangles are for
*things that are surfaces or actions*. Nothing is a circle except avatars.

**Borders.** `--bw` 1 px hairlines in `--line`; `--bw-2` 2 px frames in `--line-strong` on panels that need to
read as objects (sample cases, the scoreboard, dialogs); `--bw-3` 3 px only for the royal rule under the nav and
the accent rule on an active tab.

**Elevation is expressed by surface lightness and a hairline, not by a shadow.** A resting panel, card, table
or side box has `background: var(--surface)` and `border: 1px solid var(--line)` and **no shadow at all**. This
is the rule that separates a 2026 interface from a 2014 one, and it is what the author's other front ends do —
one of them has three `box-shadow`s in 5,600 lines, another has literally zero.

Shadows exist only for things that genuinely float above the page and must be dismissable:

| Token | Where, and nowhere else |
| --- | --- |
| `--shadow-1` | the ContestBar and a sticky table header, once the page has actually scrolled |
| `--shadow-2` | dropdown menus, popovers, selects, the contest floater, toasts |
| `--shadow-3` | dialogs, the command palette, the mobile nav sheet |
| `--shadow-hard` | `4px 4px 0 var(--line-strong)`, the club's offset block. Exactly three places: the auth card, the "contest is live" hero panel, and the empty-state frame |

All are navy-tinted (`rgba(16,26,61,…)`) so shadows share the chrome's colour family.

---

## 5. Motion

The curves are the club's, taken from `monashcoding-site` and from the author's Vite sites, where a single
expo-out curve carries every entrance and hover and a symmetric curve is reserved for full-screen overlays.
They are exported once from `@moj/ui` as `EASE` / `EASE_OUT` / `EASE_CURTAIN` array literals for framer-motion
and mirrored as tokens for CSS, so a component can never improvise a bezier.

| Token | Value | Used for |
| --- | --- | --- |
| `--dur-fast` | 120 ms | row and cell hover, focus, a countdown tick |
| `--dur` | 300 ms | buttons, chips, menus, tabs, links — the house interaction time |
| `--dur-slow` | 500 ms | reveals, page enter, sheets |
| `--dur-curtain` | 620 ms | the one full-screen wipe (the mobile nav) |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | **the house curve** (easeOutQuint). Every entrance and hover |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | easeOutExpo. Cross-fades, route changes |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | anything leaving |
| `--ease-curtain` | `cubic-bezier(.76,0,.24,1)` | symmetric. Overlays only |
| `--ease-smooth` | `cubic-bezier(.4,0,.2,1)` | micro state changes under 200 ms |

`cubic-bezier(.22,1,.36,1)` is the strongest cross-repo signal in the author's work — it is the canonical
`EASE` in the Vite sites, appears 19 times in `monashcoding-site`, and is what the newest surfaces of the
production Next sites use for underlines and overlays. It is MOJ's default and needs no justification at a
call site; any other curve does.

### 5.1 Rules

1. **Never `transition: all`.** Every transition names its properties, and unequal durations per property are
   encouraged (`transition: border-color var(--dur-fast) var(--ease), background-color var(--dur) var(--ease)`).
   The one exception is the button base, where `transition-[color,background-color,border-color,box-shadow]` at
   `--dur` covers everything it needs.
2. **Never animate layout.** Only `opacity`, `transform`, `background-color`, `border-color`, `color`,
   `box-shadow`, `clip-path`. Height changes use the `grid-template-rows: 0fr -> 1fr` trick or Radix's
   `--radix-*-content-height` variable.
3. **Nothing moves on hover.** No `translateY(-2px)`, no `scale(1.02)`, no shadow bloom — not on cards, not on
   buttons, not on rows. The author's marketing sites lift; the most evolved production work deliberately
   reversed that (its product card's hover changes `border-color` and nothing else, and its brief names
   "bouncy hover lifts" and "heavy drop shadows" as anti-references). A judge is a tool, so MOJ takes the
   evolved position everywhere. Hover changes exactly one or two of: `background-color`, `border-color`,
   `color`. Media inside a card may still scale (`transform: scale(1.04)` over 500 ms) — the *frame* stays put.
4. **Stagger is capped, never linear.** `delay = min(i * 40ms, 300ms)`. In a grid, stagger by column
   (`min((i % cols) * 40ms, 160ms)`) so the fifth row does not wait two seconds. Total stagger never exceeds
   300 ms regardless of list length.
5. **A reveal is one-way and cannot be skipped.** Scroll reveals use a `useSeen(ref, 0.9)` hook that reads
   `getBoundingClientRect()`, is true the moment the element has *ever* reached the viewport, short-circuits on
   mount and self-unsubscribes — not a bare IntersectionObserver, which a fast flick or a jump-to-bottom can
   miss and leave content permanently invisible. On a page of 500 submissions this is not optional. Once
   revealed, never un-reveal.
6. **Data does not animate.** A row whose verdict changes cross-fades its pill over `--dur-fast`; the row does
   not move, flash or sweep. A new row arriving in a live list fades in over `--dur` with no transform.
7. **Judging is the only loop.** A judging cell or pill uses a 1.6 s `opacity: 1 -> .55 -> 1` pulse. Nothing
   else in the product loops — no marquee, no shimmer, no floating orbs.
8. **Every scroll listener is `{ passive: true }` and rAF-coalesced, and writes CSS custom properties rather
   than React state.** Zero React re-renders per scroll frame. A boolean derived from scroll (`isStuck`) is set
   with `setX(prev => prev !== next ? next : prev)` so only the boundary crossing re-renders.
9. **Entrances are fade + rise; menus invert it.** Content enters `opacity 0 -> 1` with
   `translateY(+6px…20px) -> 0`. Dropdowns, popovers and selects enter from `translateY(-6px)` (they descend
   from their trigger). Nothing enters by scaling except a dialog, which uses `scale(.98) -> 1`.
10. **Page enter:** the content column only. `opacity 0 -> 1`, `translateY(6px -> 0)`, `--dur-slow`,
   `--ease-out`. Chrome — nav, ContestBar, sidebar — never animates on navigation; it must feel nailed down.
11. **Intent, not twitch.** Hover-opened menus use an 80 ms open delay and a 150 ms close delay. Tooltips use a
    300 ms delay. Links prefetch on `pointerenter`. `html { overflow-anchor: none }` so a sticky header cannot
    bob when content loads above the fold.

### 5.2 Reduced motion

`prefers-reduced-motion: reduce` **changes what is rendered, not just how fast**:

- `tokens.css` collapses `--dur-*` to 1 ms and `--lift`/`--lift-scale` to `0px`/`1`, so any component built
  only from tokens is compliant for free.
- A blanket block calms rather than kills, so state changes are still legible:
  ```css
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.15s !important;
      filter: none !important;   /* nothing may be stranded blurred */
    }
  }
  ```
- Reveal components keep a **fade branch** (`initial={{opacity:0}}` / `animate={{opacity: seen ? 1 : 0}}`)
  rather than returning nothing, so reduced-motion users still get progressive disclosure.
- The judging pulse becomes a static `--v-run` dot. Every infinite animation is covered, including the
  countdown's tick and the "connecting" indicator.
- The mobile nav sheet opens with no wipe; the command palette opens with no scale.

## 6. Iconography

Lucide (`lucide-react`), mapped one-to-one from DMOJ's FontAwesome usage. Sizes: 20 px in the nav, 16 px default,
14 px inside table rows and pills, 12 px inside `--fs-xs` text. `stroke-width: 1.75` at 16 px and above,
`2` at 14 px and below (thin strokes disappear at small sizes). Icons take `currentColor` — never a hard-coded
fill. Every icon-only control has an `aria-label` and a tooltip.

The mapping that matters:

| DMOJ | Lucide |
| --- | --- |
| `fa-check` solved | `check-circle-2` |
| `fa-minus`/attempted | `circle-dashed` |
| `fa-star` sticky/pinned | `pin` |
| `fa-trophy` contests | `trophy` |
| `fa-comments` | `message-square` |
| `fa-puzzle-piece` problems | `puzzle` |
| `fa-list` submissions | `list` |
| `fa-users` | `users` |
| `fa-bar-chart` statistics | `bar-chart-3` |
| `fa-info-circle` | `info` |
| `fa-file-pdf-o` | `file-text` |
| `fa-search` | `search` |
| `fa-cog` admin | `settings` |
| `fa-sign-out` | `log-out` |
| `fa-clock-o` | `clock` |
| `fa-database` memory | `hard-drive` |
| `fa-code` | `code-2` |
| `fa-download` | `download` |

**No emoji anywhere**, including in empty states, toasts and the olympics scoreboard theme (which uses Lucide's
sport-adjacent glyphs and a `medal` for first blood).

---

## 7. Page skeleton

DMOJ's skeleton, kept exactly:

```
fixed nav (44px)                                     --nav
3px keyline                                          --brand-royal
[ ContestBar (36px) ]                                --contest-bar, only in contest context
main#content, max-width --content-max (1280px), padded --gutter-lg
    title row:  h1 ............................ [ tabs ] [ primary action ]
    hr
    body:  .content-description  |  .info-float (sticky, --sticky-top)
footer
```

- `body` background is `--bg-2`, plain white. Panels, cards and tables are white too and are separated from the
  ground by their hairline and their navy titlebar, never by a tinted ground. The club's royal grid is painted
  on the ground at 5.5% opacity, 48 px pitch, on the home, login/register, `/about/` and error pages only.
  Dense pages (`/problems/`, `/submissions/`, rankings, staff) get a flat ground — the grid behind a table
  is noise.
- The two-column split is `grid-template-columns: minmax(0,1fr) var(--sidebar-w)` with `gap: var(--space-6)`,
  collapsing to one column under 700 px (DMOJ's breakpoint), sidebar last.
- `.info-float` is `position: sticky; top: var(--sticky-top)` (= nav height + 24 px, and + ContestBar height
  when it is present).
- `hr` under the title row is `1px solid var(--line)`, `margin: var(--space-3) 0 var(--space-5)`.
- Footer: `--bg-2`, top `1px solid var(--line)`, `--fs-sm`, `--muted`, one centred row. The language switcher is
  a Radix Select, not a native `<select>`.
- The **contest floater** (DMOJ's draggable bottom-right countdown box) survives for pages outside a contest,
  as `--surface` + `--shadow-2` + `--radius`, a 28 px titlebar with a grip and a close control, and a mono
  countdown; it is hidden whenever the ContestBar is visible (SPEC section 20).
- The **announcement box** (misc config, bottom-right) uses `--warning-bg`/`--warning-line`/`--warning-ink`,
  `--radius`, `--shadow-2`, and a close control that remembers dismissal by content hash.

---

## 8. Top nav

**The colour decision: `--nav` is `#101A3D`, MAPS navy, not DMOJ's `#3B3B3B`.** It is `#000080` pulled to
hue 226 and lightness 15% so it stops vibrating at full-bleed and lets the logo's cyan mark separate from it.
The 3 px `#nav-shadow` DMOJ draws under the bar becomes a 3 px `--brand-royal` keyline — the club's royal,
carried across the top of every page. Height stays 44 px.

```
+-----------------------------------------------------------------------------------------------+ 44px
| [MAPS]| Problems  Submissions  Contests  Users  Organizations  More v |     [search] (av) name v|
+-----------------------------------------------------------------------------------------------+
|=============================================================================================== | 3px royal
```

### 8.1 Structure

| Slot | Spec |
| --- | --- |
| Logo | `/logo.svg` at `height: 22px`, `padding: 0 var(--space-4)`, links to `/`. A 1 px `rgba(255,255,255,.18)` divider follows it (DMOJ's divider, kept) |
| Primary items | from the `navigationBar` table, in order. `height: 44px`, `padding: 0 var(--space-3)`, `--fs-base`, weight 500, `letter-spacing: .01em`, colour `--nav-ink` at 88% opacity, **not uppercase** (DMOJ uppercases them; sentence case reads better and is what the club's own nav does) |
| Item hover | `background: var(--nav-hover)`, opacity to 100%, `--dur-fast` |
| Item active (current section) | `background: var(--nav-active-bg)` **and** a 2 px `--brand-royal` bar along the bottom edge, inset to the item's width. Never a different text colour alone |
| Overflow "More" | see 8.2 |
| Search | an icon button (Lucide `search`, 20 px) that opens the command palette; on >= 1100 px it renders instead as a 220 px pill-shaped input, `background: rgba(255,255,255,.08)`, `border: 1px solid rgba(255,255,255,.14)`, placeholder `--nav-ink-2`, with a `Ctrl K` `kbd` at its right |
| User block | avatar 24 px `border-radius: 999px` + username (500 weight, rating-coloured on the nav's dark ground using the **dark** rating values) + Lucide `chevron-down` 14 px. Opens a Radix DropdownMenu |
| Logged out | "Log in" (ghost-on-dark) and "Sign up" (**the canary CTA**: `background: var(--brand-canary)`, `color: var(--nav)`, `border-radius: var(--radius-pill)`, `height: 28px`, `padding: 0 var(--space-4)`, weight 600 — the club's `.accentButton`, and the only canary in the product) |

### 8.2 It cannot overflow

The failure mode to design out is a MAPS-length nav (`navigationBar` is editable by staff and already runs
Problems / Submissions / Contests / Users / Organizations / About / Status / Runtimes) colliding with the user
block. Rules:

1. The bar is `display: flex`. Logo is `flex: 0 0 auto`; the item list is `flex: 1 1 auto; min-width: 0;
   overflow: hidden`; the right block is `flex: 0 0 auto`.
2. Items are measured on mount and on `ResizeObserver` of the bar. Any item whose right edge would pass the
   right block's left edge minus `var(--space-4)` is moved into a **More** menu (Radix DropdownMenu, label
   "More", Lucide `chevron-down`), preserving order. The More trigger is only rendered when it holds something.
3. If the current section is inside More, the More trigger itself takes the active treatment.
4. Measurement happens once per resize, in a `requestAnimationFrame`, against a hidden full-width copy — items
   never visibly reflow or "pop" as the window resizes.
5. Below **760 px** the item list is replaced by a hamburger (Lucide `menu`, 20 px, at the left, after the
   logo) opening a Radix Dialog-based sheet from the top: full width, `--nav` background, items stacked at
   44 px each, `--fs-md`, with the user block's entries appended below a `rgba(255,255,255,.14)` rule. Escape
   and a backdrop tap close it; focus is trapped; the trigger regains focus on close.
6. The username truncates at `max-width: 12ch` with an ellipsis before anything else is allowed to shrink. The
   avatar and chevron never shrink.
7. Nothing in the nav wraps. `white-space: nowrap` everywhere, and the bar never grows past 44 px.

### 8.3 User dropdown

Radix DropdownMenu, `align="end"`, `sideOffset={6}`. Panel: `--surface`, `1px solid var(--line)`,
`--radius`, `--shadow-2`, `min-width: 220px`, `padding: var(--space-1)`. Items: 32 px, `--fs-base`,
`padding: 0 var(--space-3)`, `gap: var(--space-2)`, 16 px leading icon in `--muted`,
`data-[highlighted]:bg-[--row-hover] data-[highlighted]:text-[--ink]`, `--radius-sm`. A `--line` separator
between groups. Contents, in DMOJ's order: **Admin** (staff only, `settings`), **Edit profile** (`user-cog`),
**Stop impersonating** (staff only, when impersonating, `--v-warn` text, `user-x`), separator, **Theme**
(a three-way segmented control — System / Light / Dark — writing `profiles.siteTheme` and `data-theme`),
separator, **Log out** (`log-out`, `--danger-ink` on highlight).

---

## 9. ContestBar

New in MOJ (SPEC section 20), sticky directly under the nav, 36 px, `--contest-bar` background,
`--contest-bar-ink` text, bottom `1px solid rgba(255,255,255,.1)`, `--shadow-2` once the page has scrolled.

```
+-----------------------------------------------------------------------------------------------+ 36px
| Week 7: Flows |  A  B  C  D  E  F   |  Standings  My submissions  Clarifications   01:12:44 [!]|
+-----------------------------------------------------------------------------------------------+
```

- Contest name: `--fs-sm`, weight 600, `--nav-ink`, links to `/contest/[key]`, truncates at 24ch.
- Problem chips: 24 px square, `--radius-sm`, `--font-mono` 500 `--fs-sm`, `margin-right: var(--space-1)`,
  linking to the problem. State fills use the `--state-*` tokens at their dark values (the bar is dark chrome):
  solved = `--v-good` fill with `#0B1026` text; partial = `--v-warn` fill; attempted = transparent with a 1 px
  `--v-bad` border and `--v-bad` text; untouched = `rgba(255,255,255,.08)` fill with `--contest-bar-ink`. The
  chip for the problem currently open gets a 2 px `--brand-canary` underline.
- Links: `--fs-sm`, `--contest-bar-ink`, `--space-3` apart, hover to `--nav-ink`.
- Countdown: `--font-mono` 600, tabular-nums, `--nav-ink`, right-aligned, with a Lucide `clock` 14 px. Under
  5 minutes it turns `--brand-canary`; under 60 s `--v-bad` (dark value).
- Every chip and link is in the tab order; the bar is a `<nav aria-label="Contest">`; arrow keys move between
  chips (roving tabindex).
- On mobile the chips scroll horizontally in their own `overflow-x: auto` track with `scroll-snap-type: x
  proximity`; the name truncates to 12ch; the links collapse into a single Lucide `more-horizontal`
  DropdownMenu; the countdown never moves.

---

## 10. Title row and tabs

DMOJ's title row keeps its geometry: `h1` left, tabs right, optional primary action furthest right.

- `h1`: `--fs-h1` (26 px), display 700, `--tracking-tight`, `--ink`, `text-wrap: balance`.
- Above it, when the page is inside a contest, a breadcrumb line: `--fs-sm`, `--muted`, "Contest name /
  A. Problem name", the contest name a `--link`.
- Tabs (DMOJ's `make_tab`): a Radix Tabs list, `height: 34px`, items `padding: 0 var(--space-3)`,
  `--fs-base`, `--ink-2`, 14 px leading icon. The active tab keeps DMOJ's signature: a **3 px `--accent` rule
  along the top edge**, plus `background: var(--surface)`, `color: var(--ink)`, and 1 px `--line` on the other
  three sides with the bottom border removed so it merges into the `hr`. Inactive tabs are transparent with a
  `--row-hover` hover.
- The primary action (Submit solution, Log in to participate, New post…) is a primary button at
  `--control-h`, always the right-most element in the row.
- Under 700 px the tabs move to their own full-width row below the `h1` and scroll horizontally; the primary
  action becomes full width beneath them.

---

## 11. Component kit

### 11.0 The rule

> **No native `<select>`, `<checkbox>`, `<radio>`, `<input type="date">`, `<input type="file">` or
> `<input type="range">` appears anywhere in MOJ.** Not in the staff console, not in the footer language
> switcher, not in a filter panel, not in a one-off admin form. Every one of them is a Radix (or `cmdk` /
> `react-day-picker`) primitive from `@moj/ui`. Native `<input type="text|email|password|number|search">`,
> `<textarea>` and `<button>` are fine — they are styled, not replaced.

This is the single rule that stops MOJ looking like DMOJ. DMOJ's forms are native controls with a Bootstrap
skin and a jQuery UI slider; the current judge's problem search box
([`screens/judge-problems.png`](screens/judge-problems.png)) shows exactly what that looks like — three native
checkboxes, a native-ish select and a jQuery range slider, all rendering differently on every OS.

### 11.1 Where the kit comes from

`/mnt/work/VSC/OrderRegistration/src/components/ui` is a complete, current-generation shadcn/ui kit on
Tailwind v4 (CSS-first `@theme inline`, `data-slot` architecture, `tw-animate-css`). It is the right base:
copy the files into `packages/ui/src/components`, keep the structure and the ARIA wiring, and restyle by
pointing shadcn's token names at MOJ's tokens.

**Do not copy that project's theme.** Its `--radius: 1rem` makes every control ~2× rounder than stock, its
`--accent` is a saturated amber that would collide with our "judging" state, and its `z-[9999]`/`z-[9998]`
overrides are local hacks. Take the class strings, not the values.

#### Port these files verbatim (then restyle via tokens)

`input` · `textarea` · `label` · `checkbox` · `radio-group` · `switch` · `select` · `separator` · `skeleton` ·
`scroll-area` · `tabs` · `table` · `card` · `badge` · `popover` · `dropdown-menu` · `dialog` · `alert-dialog` ·
`sheet` · `accordion` · `avatar` · `command` · `tooltip` · `toggle` · `toggle-group` · `collapsible` ·
`hover-card` · `context-menu` · `progress` · `pagination` · `form` · `input-group` · `kbd` · `empty` ·
`item` · `button-group` · `calendar` · `sonner`

Notes on the ones that matter:

- **`form.tsx`** — port unchanged. Its `useFormField` + `FormControl`-as-`Slot` wiring is what makes
  `aria-describedby` and `aria-invalid` correct on every field for free, and every `aria-invalid:` style in the
  kit depends on it. Add `react-hook-form` and `@hookform/resolvers` to `packages/ui`'s peer deps; validation
  schemas come from `@moj/protocol` (zod) so a form and its server mutation cannot drift.
- **`command.tsx`** (`cmdk`) — this *is* the command palette (SPEC section 20) and also the base for every
  combobox. There is no `combobox.tsx`: a combobox is `Popover` + `Command`, and a date picker is
  `Popover` + `Calendar`.
- **`input-group.tsx` + `kbd.tsx`** — exactly what the `/problems/` search field and the nav search need
  (leading Lucide `search`, trailing `Kbd` showing `/`).
- **`empty.tsx`** — the ready-made empty state; see section 20.
- **`table.tsx`** — port it, but **strip `whitespace-nowrap` from `td`**. It is correct for score/time/memory
  cells and wrong for problem names, verdict messages and comment bodies.
- **`badge.tsx`** — this is where the verdict variants go (section 13). Keep its `[a&]:hover:` trick (hover
  styling only when the badge is rendered as a link).
- **`card.tsx`** — keep the `[.border-b]:pb-6` / `[.border-t]:pt-6` conditional-padding trick, rescaled to
  MOJ's spacing.
- **`sonner.tsx`** — the toast layer. Mount `<Toaster />` once in the root layout.

#### Regenerate, do not copy

- **`button.tsx`.** OrderRegistration's is a pre-v4 shadcn file: `forwardRef` + a `ButtonProps` interface
  instead of `React.ComponentProps`, no `data-slot`, no `[&_svg]` icon sizing, and the legacy focus ring
  `ring-offset-background … focus-visible:ring-2 … ring-offset-2` — which is **broken** there, because
  `--color-ring-offset-background` is never defined, so the ring offset silently renders in the wrong colour.
  Its `h-10 / h-9 / h-11` size scale also sits 4 px taller than the `h-9` inputs beside it. MOJ writes its own
  from section 11.4, and that also fixes `pagination`'s ellipsis and `calendar`'s nav buttons, which both
  consume `buttonVariants`.

#### Delete / never port

`toast.tsx`, `toaster.tsx`, `use-toast.ts` (deprecated Radix Toast, legacy ring, superseded by `sonner`) ·
`sidebar.tsx` (21 KB, app-coupled) · `chart.tsx` and `chart.tsx.disabled` · `spinner.tsx` (pulls a Lottie
runtime in to draw a spinner — MOJ's is a 12-line CSS `@keyframes spin` on a Lucide `loader-2`) ·
`carousel` · `resizable` · `menubar` · `navigation-menu` · `aspect-ratio` · `input-otp` · `drawer` ·
`use-mobile.tsx` (duplicated) · every app-specific class in that project's `globals.css`.

#### Two decisions to make once

1. **`form.tsx` vs `field.tsx`.** OrderRegistration ships both, which is its main source of internal
   inconsistency. MOJ picks **`form.tsx`** (react-hook-form) and does not port `field.tsx`. The existing
   `Field` component in `packages/ui` is folded into `FormItem`/`FormLabel`/`FormDescription`/`FormMessage`.
2. **Versions.** Radix `@types/react` must be `^19` (OrderRegistration pins `^18` against React 19 and eats
   the classic `ReactNode` type errors). `tailwind-merge` must be `^3` for Tailwind v4 class awareness.
   Add `cmdk`, `sonner`, `react-day-picker`, `class-variance-authority`, `@radix-ui/react-slot`,
   `@radix-ui/react-label`, `@radix-ui/react-accordion`, `@radix-ui/react-avatar`,
   `@radix-ui/react-scroll-area`, `@radix-ui/react-separator`, `@radix-ui/react-progress`,
   `@radix-ui/react-toggle-group`, `@radix-ui/react-context-menu`, `@radix-ui/react-hover-card`,
   `@radix-ui/react-collapsible` and `tw-animate-css` to `packages/ui`.

### 11.2 The token bridge

Every ported class string speaks shadcn's token names. Rather than rewrite hundreds of class strings, map them
onto MOJ's tokens once, in `packages/ui/src/theme.css`, and import it after `tokens.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is([data-theme="dark"] *, .dark *));

@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--ink);
  --color-card: var(--surface);
  --color-card-foreground: var(--ink);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--ink);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-ink);
  --color-secondary: var(--surface-2);
  --color-secondary-foreground: var(--ink);
  --color-muted: var(--surface-2);
  --color-muted-foreground: var(--muted);
  --color-accent: var(--row-hover);        /* hover wash, NOT a brand colour */
  --color-accent-foreground: var(--ink);
  --color-destructive: var(--v-bad);
  --color-destructive-foreground: #ffffff;
  --color-border: var(--line);
  --color-input: var(--line-strong);
  --color-ring: var(--brand-royal);

  --radius: var(--radius);                 /* 4px, not shadcn's 10px or OR's 16px */
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius);
  --radius-lg: var(--radius-lg);

  --font-sans: var(--font-body);
  --font-mono: var(--font-mono);
  --font-display: var(--font-display);
}
```

Two things this bridge fixes on the way in: shadcn's `--accent` (which drives every hover and `skeleton`) maps
to `--row-hover`, a neutral wash, so no hover state can ever collide with a status colour; and `--ring` maps to
`--brand-royal`, so the club's royal is the focus colour across every control in the product.

**One z-scale**, defined in `theme.css` and used by every overlay — no `z-[9999]` anywhere:
`--z-nav: 100`, `--z-contest-bar: 90`, `--z-sticky: 50`, `--z-floater: 200`, `--z-overlay: 300`,
`--z-dialog: 310`, `--z-palette: 320`, `--z-toast: 400`, `--z-tooltip: 500`.

### 11.3 The two conventions every control obeys

**Focus.** One ring, everywhere, no exceptions and no `ring-offset`:

```
outline-none transition-[color,box-shadow]
focus-visible:border-[--brand-royal] focus-visible:ring-[3px] focus-visible:ring-[--brand-royal]/45
aria-invalid:border-[--v-bad] aria-invalid:ring-[--v-bad]/25
```

A 3 px 45%-opacity halo plus a solid border recolour. No offset, so focus never changes layout and never
clips inside a table cell or a `overflow: hidden` panel. Rows, chips, cells, links and icon buttons use the
same ring via `--focus-ring`. Keyboard focus must be visible on **every** interactive thing on a dense page,
including table rows and scoreboard cells.

**Disabled.** `opacity: .5` is the universal signal, plus:
- actions and triggers: `disabled:pointer-events-none`
- form controls: `disabled:cursor-not-allowed`
- Radix items: `data-[disabled]:pointer-events-none data-[disabled]:opacity-50`
- `cmdk` items: `data-[disabled=true]:…` (cmdk writes `="true"`, Radix writes the bare attribute)
- labels follow their control: `peer-disabled:cursor-not-allowed peer-disabled:opacity-50`

### 11.4 Control recipes

All heights come from `--control-h` (32 px) and `--control-h-sm` (26 px). Every recipe below adds the focus and
disabled conventions from 11.3; they are omitted for brevity.

| Control | Primitive | Recipe |
| --- | --- | --- |
| **Button / primary** | native `<button>` + `@radix-ui/react-slot` + cva | `h-[--control-h] px-[--space-4] gap-[--space-2] rounded-[--radius] text-[--fs-base] font-medium bg-[--accent] text-[--accent-ink] hover:bg-[--accent-hover] active:bg-[--accent-active] shadow-none` + `[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4` |
| **Button / secondary** | " | `bg-[--surface] text-[--ink] border border-[--line-strong] hover:bg-[--surface-2] hover:border-[--line-strong]` |
| **Button / danger** | " | `bg-[--v-bad] text-white hover:brightness-[.92]` — used only for destructive confirmations, never for "Cancel" |
| **Button / ghost** | " | `bg-transparent text-[--ink-2] hover:bg-[--row-hover] hover:text-[--ink]` |
| **Button / link** | " | `text-[--link] underline-offset-4 hover:underline h-auto p-0` |
| **Button sizes** | " | `sm: h-[--control-h-sm] px-[--space-3] text-[--fs-sm]` · `icon: size-[--control-h] p-0` · `icon-sm: size-[--control-h-sm] p-0` · `full: w-full` |
| **Button busy** | " | `aria-busy` swaps the leading icon for a spinning Lucide `loader-2` (0.8 s linear), keeps the label and the width, and sets `pointer-events-none` — buttons never collapse to a spinner |
| **Input / Textarea** | native, styled | `h-[--control-h] w-full min-w-0 rounded-[--radius] border border-[--line-strong] bg-[--bg] px-[--space-3] text-base md:text-[--fs-base] text-[--ink] placeholder:text-[--muted] shadow-none` — keep shadcn's `text-base md:text-sm`, it is what stops iOS zooming on focus. Textarea: `min-h-[96px] py-[--space-2] leading-[--lh] resize-y` |
| **Input, mono** | " | add `font-[--font-mono] text-[--fs-mono] tabular-nums` for anything numeric (points, time limits, memory) |
| **Select** | `@radix-ui/react-select` | Trigger: `h-[--control-h] w-full justify-between gap-[--space-2] rounded-[--radius] border border-[--line-strong] bg-[--bg] px-[--space-3] text-[--fs-base] data-[placeholder]:text-[--muted]`, chevron 16 px `--muted`. Content: `bg-[--surface] border border-[--line] rounded-[--radius] shadow-[--shadow-2] p-[--space-1] max-h-(--radix-select-content-available-height) min-w-[--radix-select-trigger-width] z-[--z-dialog]`. Item: `h-[28px] rounded-[--radius-sm] px-[--space-2] pr-[--space-6] text-[--fs-base] data-[highlighted]:bg-[--row-hover]`, check icon 14 px at the right. Sizes via `data-[size=sm]:h-[--control-h-sm]` |
| **Checkbox** | `@radix-ui/react-checkbox` | `size-4 shrink-0 rounded-[--radius-sm] border border-[--line-strong] bg-[--bg] data-[state=checked]:bg-[--accent] data-[state=checked]:border-[--accent] data-[state=checked]:text-[--accent-ink]`, indicator Lucide `check` at `size-3.5`, indeterminate `minus`. Label sits at `--space-2`, whole row clickable |
| **Radio** | `@radix-ui/react-radio-group` | Root `grid gap-[--space-3]`. Item `size-4 aspect-square rounded-full border border-[--line-strong] text-[--accent]`, indicator `size-2 rounded-full bg-[--accent]` centred |
| **Switch** | `@radix-ui/react-switch` | Track `h-[18px] w-8 rounded-full bg-[--surface-3] data-[state=checked]:bg-[--accent]`, thumb `size-[14px] rounded-full bg-white shadow-[--shadow-1] transition-transform data-[state=checked]:translate-x-[calc(100%-2px)]`. Used only for genuinely instant, reversible settings (dark mode, "show my real name"); anything that needs a Save is a Checkbox |
| **Combobox** | `Popover` + `cmdk` | Trigger is a secondary button showing the selection or the placeholder + `chevrons-up-down` 14 px. Panel `w-[--radix-popover-trigger-width] p-0`, containing `CommandInput` (`h-[--control-h]`, bottom `1px --line`, leading `search` 14 px), `CommandList` `max-h-[280px]`, `CommandEmpty` `py-6 text-center text-[--fs-sm] text-[--muted]`, items at 28 px with `data-[selected=true]:bg-[--row-hover]`. Multi-select shows chosen values as removable pills above the input |
| **Multi-select** (types, organisations, solved-by) | Combobox | Pills: `h-[22px] rounded-[--radius-pill] bg-[--accent-soft] text-[--accent] border border-[--accent-line] pl-[--space-2] pr-[2px] text-[--fs-xs] font-medium`, trailing `x` button `size-4`. Backspace on an empty input removes the last pill |
| **Date / time** | `Popover` + `react-day-picker` v9 | Trigger is a secondary button, `calendar` 14 px, showing `d MMM yyyy, HH:mm` in `--font-mono`. Calendar `[--cell-size:32px]`, `--today` ringed in `--brand-royal`, selected `bg-[--accent] text-[--accent-ink]`, range middle `bg-[--accent-soft]`. All times display in the club timezone with the viewer's local time in a tooltip |
| **Dialog** | `@radix-ui/react-dialog` | Overlay `fixed inset-0 z-[--z-overlay] bg-[#0B1026]/55 backdrop-blur-[2px]`. Content `z-[--z-dialog] w-full max-w-[520px] rounded-[--radius-lg] border border-[--line] bg-[--surface] p-[--space-5] shadow-[--shadow-3] gap-[--space-4]`, enter `fade-in-0 zoom-in-[.98] slide-in-from-bottom-1` over `--dur-slow`. Title `--fs-h3` display 600; description `--fs-sm --muted`; footer `flex flex-col-reverse gap-[--space-2] sm:flex-row sm:justify-end`, primary right-most |
| **Alert dialog** | `@radix-ui/react-alert-dialog` | Same shell. Used for every irreversible action (delete problem, abort submission, rejudge, kick member). The confirm button is `danger`; the cancel button is `secondary` and is focused on open |
| **Dropdown menu** | `@radix-ui/react-dropdown-menu` | Content `z-[--z-dialog] min-w-[200px] rounded-[--radius] border border-[--line] bg-[--surface] p-[--space-1] shadow-[--shadow-2]`, enter `fade-in-0 zoom-in-95 slide-in-from-top-1` over `--dur`. Item `h-8 rounded-[--radius-sm] px-[--space-2] gap-[--space-2] text-[--fs-base] data-[highlighted]:bg-[--row-hover]`, 16 px leading icon in `--muted`. Keep shadcn's `data-[variant=destructive]` item variant, mapped to `--v-bad` |
| **Context menu** | `@radix-ui/react-context-menu` | Same panel styling. Staff console only (right-click a row for Rejudge / Rescore / Open in admin) |
| **Popover** | `@radix-ui/react-popover` | `z-[--z-dialog] w-72 rounded-[--radius] border border-[--line] bg-[--surface] p-[--space-4] shadow-[--shadow-2]`, `sideOffset={6}` |
| **Tooltip** | `@radix-ui/react-tooltip` | `z-[--z-tooltip] rounded-[--radius-sm] bg-[--ink] text-[--bg] px-[--space-2] py-[3px] text-[--fs-xs] text-balance max-w-[260px]`, `sideOffset={6}`, `delayDuration={300}` — **not** OrderRegistration's `0`, which fires tooltips on every accidental pass over a dense table. Mount `TooltipProvider` once at the root; do not let `Tooltip` self-wrap a provider |
| **Toast** | `sonner` | Bottom-right (bottom-centre under 700 px), `richColors={false}`, `closeButton`, `duration={5000}`, `visibleToasts={3}`. Bridge: `--normal-bg: var(--surface)`, `--normal-text: var(--ink)`, `--normal-border: var(--line)`. Variants take a 16 px leading Lucide icon and a 3 px left rail in `--v-good` / `--v-bad` / `--v-warn` / `--v-run` |
| **Tabs** | `@radix-ui/react-tabs` | Two shapes. **Page tabs** (under a title) use DMOJ's top-rule form from section 10. **Segmented tabs** (inside a panel: All / Mine, List / Calendar, Leaderboard / Organizations) use shadcn's form: list `h-[--control-h] rounded-[--radius] bg-[--surface-2] p-[3px]`, trigger `h-[calc(100%-1px)] rounded-[--radius-sm] px-[--space-3] text-[--fs-sm] font-medium data-[state=active]:bg-[--surface] data-[state=active]:shadow-[--shadow-1] data-[state=active]:text-[--ink]` |
| **Accordion / Collapsible** | Radix | Item `border-b border-[--line] last:border-b-0`; trigger `py-[--space-3] text-[--fs-base] font-medium [&[data-state=open]>svg]:rotate-180`, chevron 16 px `--muted` `transition-transform duration-[--dur]`; content animates on `--radix-accordion-content-height` over `--dur`. Used for "Problem type", statement subtasks, staff filter groups |
| **Progress** | `@radix-ui/react-progress` | `h-1 w-full rounded-[--radius-pill] bg-[--surface-3]`, indicator `bg-[--brand-royal]`, `transition-transform duration-[--dur]`. Height 4 px for contest elapsed, 6 px with a label for job progress |
| **Skeleton** | none | `bg-[--surface-2] rounded-[--radius] animate-pulse` (1.6 s). Skeletons mirror the real row's geometry — a problem-list skeleton is 8 rows at `--row-h` with three bars at the real column widths. Never a centred spinner for a list |
| **Avatar** | `@radix-ui/react-avatar` | `size-6` in the nav, `size-8` in lists, `size-16` on a profile; `rounded-full`; fallback `bg-[--surface-2] text-[--ink-2] text-[--fs-xs] font-semibold` with the initials |
| **Badge** | cva | see section 13 |
| **Pagination** | shadcn `pagination` | `h-[--control-h-sm] min-w-[--control-h-sm] rounded-[--radius] text-[--fs-sm] font-mono tabular-nums`; current page `bg-[--accent] text-[--accent-ink]`; others ghost; ellipsis the same size as a page button (OrderRegistration's is 4 px short — fix on the way in). Prev/Next show their labels above 640 px only |
| **Kbd** | shadcn `kbd` | `h-[18px] min-w-[18px] rounded-[--radius-sm] border border-[--line-strong] bg-[--surface-2] px-[5px] text-[--fs-xs] font-mono text-[--ink-2] shadow-[0_1px_0_var(--line-strong)]` |
| **Scroll area** | `@radix-ui/react-scroll-area` | thumb `bg-[--line-strong] rounded-full`, scrollbar `w-2.5`. Used for the command palette list, long dropdowns and the hall scoreboard |
| **Sheet** | `@radix-ui/react-dialog` | The mobile nav (top) and the mobile filter panel (bottom). `bg-[--surface]`, `shadow-[--shadow-3]`, enter 220 ms / leave 180 ms |

---

## 12. Tables

DMOJ's tables keep their columns, their order and their sort affordances, and they keep their dark header
band — recoloured from DMOJ's near-black to the club's navy, so a table header and a panel titlebar are the
same object. The whole table becomes a framed object.

The recipe is the author's own — radius and border on the *wrapper*, `border-collapse: collapse` inside, a
tinted header row, zebra on even rows, and the last row losing its rule:

```css
.table-wrap {                     /* the frame */
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;               /* clips the header's corners */
  overflow-x: auto;               /* wide tables scroll here, never the page */
}
.table { width: 100%; border-collapse: collapse; font-size: var(--fs-base); }
.table thead th {
  height: 32px;
  padding: 0 var(--space-3);
  background: var(--titlebar);
  color: var(--titlebar-ink);
  font: 600 var(--fs-xs)/1 var(--font-body);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.table tbody td {
  height: var(--row-h);
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.table tbody tr:nth-child(even) { background: var(--row-zebra); }
.table tbody tr:hover           { background: var(--row-hover); }
.table tbody tr:last-child td   { border-bottom: 0; }
```

Rules:

- **Numeric columns are mono and right-aligned**: `font-family: var(--font-mono); font-size: var(--fs-mono);
  font-variant-numeric: tabular-nums; text-align: right`. Points, AC %, users, score, time, memory, rank, rating.
- **`white-space: nowrap` belongs on `th` and on numeric `td` only.** Never on a problem name, a verdict
  message or a comment body.
- **Sortable headers** are buttons filling the cell, with a 12 px Lucide `chevron-up`/`chevron-down` after the
  label at `--muted`; the active sort column's label goes `--ink` and its chevron `--accent`. Sort state lives
  in the URL query.
- **Sticky header**: `position: sticky; top: var(--header-height)` on `thead th`, with `--header-height`
  published from the chrome by a `ResizeObserver` (nav + ContestBar when present) so nothing has to guess.
  The header gains `box-shadow: var(--shadow-1)` only once `scrollTop > 0`.
- **Row links**: the whole row is a link target via a stretched anchor on the primary cell
  (`a::after { position: absolute; inset: 0 }`), so the hit area is the row, but the accessible name is still
  the problem title. Secondary links inside the row sit above it with `position: relative; z-index: 1`.
- **Row focus** uses `outline: 2px solid var(--brand-royal); outline-offset: -2px` (inset, so it is not clipped
  by the wrapper's `overflow: hidden`).
- **Keyboard**: `j`/`k` and the arrow keys move a roving-tabindex row cursor; `Enter` opens; `?` shows the
  shortcut sheet.
- Under 700 px a table either scrolls inside its wrapper (rankings, which must stay tabular) or reflows into
  stacked rows (the problem list and submission list, which do not) — see section 22.

### 12.1 Problem list (`/problems/`)

Columns as DMOJ: state, Problem, Category, Types, Points, AC %, editorial, Users. Changes:

- A first 28 px column carries the viewer's state as a 14 px icon: `check-circle-2` in `--state-solved`,
  `circle-slash-2` in `--state-partial`, `circle-dashed` in `--state-attempted`, nothing for untouched. Each
  has a tooltip. DMOJ colours the whole row title instead; the icon column is clearer and colour-blind safe.
- Problem name in `--ink` at weight 500, not link-blue — the row is the link, and 50 blue names per screen is
  noise. It goes `--link` on row hover.
- The problem code renders after the name in `--font-mono --fs-sm --muted`, which DMOJ omits entirely and
  which members ask for constantly.
- Points: mono, right-aligned. Partial-scored problems show `100p` with the `p` in `--muted`.
- AC %: mono, right-aligned, plus a 3 px bar under the number in `--heat-2` at that percentage —
  the cheapest possible sparkline, and it makes the column scannable.
- Editorial: `book-open` 14 px in `--v-good` when present, `--muted` at 35% opacity when not. DMOJ's red
  "no editorial" stop-sign is removed; absence is not an error.
- **Group by contest** (SPEC section 20) inserts a full-width group header row: `--surface-2`,
  `--row-h-dense`, the contest name as a `.label` at the left and its date at the right in mono.

### 12.2 Submission list (`/submissions/`)

DMOJ's two-line row and its left status block stay exactly where they are. The saturated block goes.

```
+---+----------------------------------------------+------------+
| | |  Humpty Dumpty                   AC  C++20    |     0.06s  |   52px row
| | |  emertylover445 . 61 minutes ago              |     1.9 MB |
+---+----------------------------------------------+------------+
 ^ 3px verdict rail        ^ score pill
```

| Part | Spec |
| --- | --- |
| Verdict rail | 3 px full-height bar at the row's left edge in `--v-<verdict>`. Replaces DMOJ's ~90 px saturated fill. Twenty AC rows in a column read as a green margin rule, not a green wall |
| Score | `--font-mono` 500, `--fs-sm`, tabular-nums, `"100 / 100"` with the slash and denominator in `--muted`. Sits at the left of the first line |
| Verdict pill | section 13, immediately after the problem name |
| Language | `--font-mono --fs-xs --muted`, uppercase, after the pill |
| Problem name | `--ink` 500, the row's stretched link |
| Second line | username (rating-coloured, mono 500) + `.` + relative time with an absolute `title`; `--fs-sm --muted` |
| Time / memory | right column, mono, tabular-nums, right-aligned, stacked; `--muted` for memory. A missing time is an em-dash `—`, never `---` |
| Live rows | a new submission fades in over `--dur`; a verdict change cross-fades the pill and the rail over `--dur-fast`; the row never moves |
| Disconnected | DMOJ's full-width red "You were disconnected" band becomes a `--warning-bg` strip with a `plug-zap` icon and a "Reconnect" ghost button, and it does not push the list down (it replaces the pagination row) |

### 12.3 Rankings and the leaderboard (`/users/`)

`--row-h-dense` (28 px). Rank mono/right/`--muted`, with the top three in `--ink` 600. Username
rating-coloured at 500. Points and problem count mono/right. The viewer's own row is
`background: var(--row-selected)` with a 3 px `--brand-royal` left rail, and if they are off-page an extra
sticky row pinned to the bottom of the wrapper shows their position.

---

## 13. Verdict pills, states and ratings

A verdict pill is a `Badge` variant. There is **one resolver** — `verdictTone(code)` in `packages/core` —
mapping every verdict code to one of the five families; no component ever writes an inline ternary over
verdict codes, and no component hard-codes a verdict colour.

```
AC   -> good      WA  -> bad       TLE MLE CE AB QU -> neutral
SC   -> good      IE  -> bad*      OLE IR RTE       -> warn
                                   QU (judging)     -> run
```

| Property | Value |
| --- | --- |
| Shape | `height: 18px`, `padding: 0 6px`, `border-radius: var(--radius-sm)`, `border: 1px solid transparent` |
| Type | `--font-mono`, `--fs-xs`, weight 500, `letter-spacing: .02em`, uppercase |
| Fill | `background: var(--v-<x>-bg)`, `color: var(--v-<x>)` — the tint-fill + full-strength-text recipe the author's app UI uses for every status |
| IE | as `bad`, but `border-color: var(--v-ie)` and `border-style: dashed`, so an infrastructure failure never looks like the competitor's fault |
| Judging | `--v-run` family plus the 1.6 s pulse; a static dot under reduced motion |
| Never | colour alone. The code (`AC`, `WA`, `TLE`) is always rendered |

**Problem state** uses the same five families through `--state-*`, so a solved problem, an AC submission and a
solved scoreboard cell are visibly the same green everywhere in the product.

**Ratings** render through one `RatingName` component: the username in `--font-mono` 500 at the
`--rating-<class>` colour, with the target class adding a 1 px ring on the avatar. Rating *numbers* are mono
and tabular. A rating delta is `+42` in `--v-good` or `-17` in `--v-bad`, always signed, always mono.

---

## 14. Problem page and statement typography

Layout is DMOJ's, unchanged: title row with "View as PDF" at the right, statement in the left column, sticky
`.info-float` at the right holding **Submit solution** at the top, then the submission links, then the limits,
then the author, then the collapsible problem type. See [`screens/judge-problem.png`](screens/judge-problem.png).

### 14.1 The info box

A panel (titlebar + framed body) whose titlebar reads the problem code in mono. Inside, in DMOJ's order:

- **Submit solution** — primary button, full width, `--control-h`. Below it, All submissions / Best submissions
  as ghost links, `--fs-sm`.
- A `--line` rule, then a definition list at `--fs-sm`: 14 px Lucide icon in `--muted`, label in `--ink-2`,
  value in `--font-mono --ink`. Points (`check`), Time limit (`clock`), Memory limit (`hard-drive`),
  Allowed languages (`code-2`, showing counts with a tooltip listing them).
- **Stats strip** (SPEC section 20): solvers, attempts, AC rate, fastest solve — a 2x2 mono grid, each cell a
  number at `--fs-md` mono 500 over a `.label`.
- **Appeared in** (SPEC section 20): one line per contest — contest name (link), its label there in a 18 px
  mono chip, the date. Collapsed to three with a "show all" ghost link.
- Author(s), rating-coloured. Problem type as a Radix Collapsible.
- When the viewer is in the contest that owns this problem, the box is topped by a `--accent-soft` strip:
  "Contest mode — Week 7: Flows" with the countdown, and previous/next problem links.

### 14.2 Statement typography

Statements are the one place in MOJ that is genuinely prose.

- Column: `max-width: var(--prose-max)` (74ch), `font-size: var(--fs-md)` (16 px), `line-height: var(--lh-prose)`
  (1.65), `color: var(--ink)`.
- Headings are **demoted by two levels** by the content pipeline, so an author's `#` renders as `h3`. The
  visual scale is deliberately flat — `h3` 16 px display 600, `h4` 14 px body 600 in `--ink-2` — because a
  statement's sections are peers, not a hierarchy. DMOJ renders them at near-`h1` size and it dominates the
  page.
- Paragraph spacing `var(--space-4)`; list indent `var(--space-5)`; `text-wrap: pretty`.
- Inline code: `background: var(--code-bg)`, `border: 1px solid var(--code-line)`, `border-radius: var(--radius-sm)`,
  `padding: 1px 5px`, `font-size: .92em`, mono.
- KaTeX inherits `--ink` and never scrollbars; display math is centred with `overflow-x: auto` on its own row.
- Images carry explicit `width`/`height` from the content pipeline so a statement never shifts as it loads,
  and get `border: 1px solid var(--line)`, `border-radius: var(--radius)`, `background: var(--surface-2)`.
- Tables inside a statement use the section 12 skin at `--fs-sm`, wrapped in `.h-scrollable-table`.

### 14.3 Sample cases

DMOJ's sample blocks with their top-right Copy button keep their position. They become **windows** — the club's
motif, and the single clearest place to use it:

```
+-----------------------------------------------+
| INPUT 1                              [ Copy ] |  titlebar 26px, --titlebar,
+-----------------------------------------------+  .label at left, ghost icon-sm at right
| 10 3                                          |  body: --code-bg, mono 13px,
| abbabbbaab                                    |  line-height 1.5, padding --space-3
| 1 2                                           |
+-----------------------------------------------+
```

- Frame `border: 1px solid var(--line-strong)`, `border-radius: var(--radius)`, `overflow: hidden`.
- Input and its output sit side by side above 900 px in a two-column grid with `gap: var(--space-3)`, stacked
  below. DMOJ stacks them always, which doubles the scroll on a page of five samples.
- Copy: ghost icon button, Lucide `copy`, swapping to `check` in `--v-good` for 1.2 s on success. It announces
  through an `aria-live="polite"` region; it does **not** raise a toast.
- Long samples clamp at `max-height: 320px` with a fade to `--code-bg` and a "Show all (42 lines)" ghost button.
- An explanation paragraph, if present, sits under the pair in `--fs-sm --ink-2`, not inside the frame.

### 14.4 Code blocks in editorials and comments

Shiki, GitHub Light / GitHub Dark, wrapped in `.codehilite`: same frame as a sample case, titlebar showing the
language name as a `.label` and a Copy button. Line numbers in `--muted` at 35% opacity, unselectable. No
line-highlight animation.

---

## 15. Submission status page (`/submission/[id]`)

DMOJ's structure — header block, per-case rows, source below — kept.

```
+--------------------------------------------------------------+
| Humpty Dumpty                       [ AC ]  100 / 100         |  header panel
| emertylover445 . C++20 . 61 minutes ago . 0.06s . 1.9 MB      |
+--------------------------------------------------------------+
| [=================================        ] 12 / 18 cases     |  progress, live
+--------------------------------------------------------------+
| BATCH 1                                        18 / 18        |  batch titlebar
|  #1  AC    0.012s   1.9 MB                                    |  case rows, 28px
|  #2  AC    0.014s   1.9 MB                                    |
|  #3  WA    0.011s   1.9 MB   wrong answer on line 3           |
+--------------------------------------------------------------+
```

- Header: the score in `--font-mono` at `--fs-h2`, the verdict pill at `--fs-sm` (one size up from a list pill),
  the meta line in `--fs-sm --muted` with mono values.
- Progress bar: 6 px, `--surface-3` track, `--brand-royal` fill, `transition: transform var(--dur) var(--ease)`,
  with "12 / 18 cases" in mono beside it. It disappears — it does not turn green — when judging finishes.
- Case rows at `--row-h-dense`: index mono `--muted`, verdict pill, time and memory mono right-aligned, and the
  checker's feedback in `--fs-sm --ink-2` truncated to one line with the full text in a tooltip. Rows arrive
  one at a time and fade in over `--dur-fast`; the list does not scroll itself or jump.
- Batches are panels; a batch titlebar shows its label and its earned/total points in mono.
- The currently-judging case pulses; every case after it is a `--surface-2` skeleton bar at 28 px, so the final
  height is known from the start and nothing reflows as results arrive.
- Compile output, when present, is a `--warning-bg` framed block above the cases with the compiler's text in
  mono at `--fs-mono`, `white-space: pre-wrap`.
- Source: a code window (14.4) with the language in its titlebar plus Copy, "Raw" and "Resubmit" ghost actions.
- Staff-only actions (Rejudge, Abort) are ghost buttons in the header's right corner; Abort opens an
  AlertDialog.

---

## 16. Contest ranking and the hall scoreboard

### 16.1 `/contest/[key]/ranking/`

A dense table: `--row-h-dense`, sticky header, and a **sticky first column** carrying rank + username
(`position: sticky; left: 0` with a `--line-strong` right border and the row's own background, so it does not
go transparent while scrolling).

Per-problem cells are 44 px wide, centred, mono, `--fs-sm`:

| State | Fill | Ink | Extra |
| --- | --- | --- | --- |
| solved | `--cell-solved-bg` | `--cell-solved-ink` | points, and the solve time in `--fs-xs` below |
| first blood | `--cell-first-bg` | `--cell-first-ink` | plus `box-shadow: inset 0 0 0 2px var(--cell-first-ring)`; a Lucide `medal` in the olympics theme |
| partial | `--v-warn-bg` | `--v-warn` | earned points |
| failed | `--cell-failed-bg` | `--cell-failed-ink` | attempt count as `-3` |
| frozen | `--cell-frozen-bg` | `--cell-frozen-ink` | a `?` glyph, and the attempt count |
| judging | `--cell-judging-bg` | `--cell-judging-ink` | the pulse |
| untouched | transparent | `--cell-empty-ink` | an em-dash |

The viewer's own row is `--row-selected` with a `--brand-royal` left rail and stays pinned to the bottom of
the wrapper when scrolled off. Organisation badges sit after the username as 16 px chips. Above the table:
a segmented control (All / In-person / My organisation) and the frozen banner in `--info-bg` when the
scoreboard is frozen, stating the freeze time in mono.

### 16.2 `/scoreboard/[event]` (the hall)

Built to be read from ten metres. It is the one page that spends the club's taste for oversized display type.

- Full-bleed `--nav` background with the royal grid at 8% — the same chrome as the top bar, so the hall screen
  is unmistakably the same product.
- Division title in Bai Jamjuree 700 at `clamp(2rem, 4vw, 3.5rem)`, `--tracking-tight`; the countdown beside it
  in mono at the same size, tabular.
- Rows at 44 px, `--fs-md`, alternating `rgba(255,255,255,.03)`. Cells use the dark `--cell-*` values.
- First blood gets the gold ring and, in `olympics`, a `medal` glyph plus a Lucide sport pictogram per problem
  column replacing the letter.
- The carousel between divisions cross-fades over `--dur-slow`/`--ease-out` with no movement, on a fixed
  interval, pausable with `space`.
- Keyboard, as SPEC section 7: arrows, `P`, `F`, `I`, `E`, `R`. A `?` overlay lists them. The reveal ceremony
  advances one cell at a time from the bottom rank up, each reveal a `--dur` cross-fade — never a spin or a
  flip.

---

## 17. Filter panel, search and the command palette

### 17.1 `/problems/` filter panel

DMOJ's right-hand "Problem search" box keeps its position and becomes a panel. Its native checkboxes, native
select and jQuery UI slider are all replaced (section 11).

```
+-----------------------------+
| FILTERS            [ Reset ]|
+-----------------------------+
| [search] Search problems  / |   input-group + Kbd
|                             |
| STATUS                      |   .label group header, border-top --line
|  ( ) All                    |   RadioGroup
|  ( ) Solved                 |
|  ( ) Attempted              |
|  ( ) Unsolved               |
|                             |
| TYPES                    3  |   count pill, collapsible
|  [x] Graph Theory        41 |
|  [ ] Dynamic Programming 88 |
|                             |
| POINTS                      |
|  [ 1 ]------o------[ 100 ]  |   Radix Slider
|                             |
| SOLVED BY                   |
|  ( pleeric x ) ( inj x )    |   multi-select pills
|  [x] and not by me          |
+-----------------------------+
```

- Groups are separated by `border-top: 1px solid var(--line)` and a `.label` header — **hairlines, not nested
  boxes**. Each group is a Collapsible animating `grid-template-rows: 0fr -> 1fr`.
- A group's active-filter count is an 18 px `--accent` pill at the right of its header.
- Option rows are 26 px, `--fs-sm`, `--ink-2`, hovering to `--ink`; the facet count sits right-aligned in mono
  `--muted`.
- Active filters appear as removable pills above the results, entering at 220 ms and leaving at 180 ms.
- Every filter writes to the URL query, so a filtered list is a shareable link (SPEC section 20).
- The panel's own scrollbar is invisible until hover (`scrollbar-color: transparent transparent` ->
  `var(--line-strong) transparent` over 200 ms).
- Under 900 px the panel becomes a bottom Sheet opened by a "Filters (3)" secondary button in the title row.

### 17.2 Command palette

`cmdk` in a Dialog. Opens on `Ctrl/Cmd + K` from anywhere, and on `/` when focus is not in a text field.

- Panel: `--z-palette`, `max-width: 640px`, `top: 12vh`, `--radius-lg`, `--surface`, `--shadow-3`, entering
  `opacity 0 -> 1` + `scale(.98) -> 1` over `--dur`/`--ease`.
- Input row 48 px with a 18 px `search` icon and an `Esc` `Kbd` at the right.
- Groups in order: Recent, Problems, Contests, Users, Organisations, Pages, Actions. Group headers are
  `.label`. Items 36 px with a 16 px type icon, the title, and a mono right-aligned hint (a problem's code, a
  contest's date, a user's rating).
- Results come from the Convex search indexes, debounced 120 ms, capped at 6 per group. `CommandEmpty` reads
  "No matches for *query*." — the query is quoted, and a "Search all problems" action follows it.
- Actions include Submit solution (contextual), Random problem, Toggle dark mode, and staff-only Rejudge.

### 17.3 Keyboard

MOJ ships the keyboard layer the author's other app UI does not have. `?` opens a shortcut sheet — a Dialog of
two columns of `Kbd` + description — and every shortcut in it works:

| Key | Action |
| --- | --- |
| `Ctrl/Cmd K` or `/` | command palette |
| `j` / `k` or arrows | move the row cursor in any list |
| `Enter` | open the focused row |
| `Ctrl/Cmd Enter` | submit, from the submit form or the editor |
| `g` then `p` / `s` / `c` / `u` | go to problems / submissions / contests / users |
| `[` / `]` | previous / next problem inside a contest |
| `r` | refresh a live list (it is already live; this forces a refetch) |
| `?` | this sheet |
| `Esc` | close the topmost overlay |

---

## 18. Auth pages

`/accounts/login/` and `/accounts/register/` are full pages, not a modal, and they are the one place the club's
display type gets to be loud.

```
                    +-------------------------+
                    |        [ MAPS ]         |   wordmark, 28px, --ink
                    |                         |
                    |  Sign in                |   h1, 26px display 700
                    |  to the MAPS Online     |   --fs-sm --muted
                    |  Judge                  |
                    |                         |
                    |  Username or email      |   .label
                    |  [_____________________]|   input, --control-h
                    |                         |
                    |  Password    Forgot?    |   label row, link right
                    |  [_____________________]|
                    |                         |
                    |  [    Sign in        ]  |   primary, full width, 36px
                    |                         |
                    |  ---------- or ---------|
                    |  [  Passkey          ]  |   secondary, full width
                    |                         |
                    |  New here? Create an    |
                    |  account                |
                    +-------------------------+
                       420px, --shadow-hard
```

- Page: `--bg-2` with the royal grid at full 5.5%, content vertically centred, `min-height: 100dvh`.
- Card: `width: 420px` (`max-width: calc(100vw - 32px)`), `--surface`, `border: 1px solid var(--line-strong)`,
  `--radius`, `padding: var(--space-6)`, and **`box-shadow: var(--shadow-hard)`** — one of the three sanctioned
  uses of the club's offset block.
- Wordmark above the card at 28 px, in `--ink` (the light-mode inversion of the nav's white wordmark).
- A dark-mode toggle sits at the top-right of the viewport, as SPEC requires.
- Errors are a `--danger-bg` strip above the fields with a 14 px `alert-circle`, plus `aria-invalid` on the
  field itself; they never appear as a toast.
- The pwned-password warning (SPEC section 13) is a `--warning-bg` strip under the password field with
  "Continue anyway" and "Choose another" — not a blocking dialog.
- 2FA: the same card, a `Kbd`-styled 6-box `input-otp`, auto-advancing and auto-submitting, with "Use a backup
  code" as a ghost link.

### Register

Same card, widened to **660 px**, with a **two-column grid** above 720 px
(`grid-template-columns: 1fr 1fr; gap: 0 var(--space-4)`) and one column below:

| Row | Fields |
| --- | --- |
| 1 | Username · Email |
| 2 | Password · Confirm password |
| 3 (span 2) | Password strength meter — a 4 px `--surface-3` track filling `--v-bad` -> `--v-warn` -> `--v-good`, with a word, not a score |
| 4 | Timezone (Select) · Preferred language (Select) |
| 5 (span 2) | Organisations — multi-select combobox, max 3, showing "2 of 3 chosen" |
| 6 (span 2) | Primary button, full width, then "Already have an account? Sign in" |

Field order and content match DMOJ's registration exactly (SPEC section 13). Every control is a `@moj/ui`
component; the timezone and language pickers in particular are Radix Selects with a typeahead, not native
selects with 400 `<option>`s.

---

## 19. Forms and the staff console

### 19.1 Forms

- `FormItem` is `display: grid; gap: var(--space-1)`; fields are `var(--space-4)` apart.
- Labels are `.label`-adjacent but sentence case: `--fs-sm`, weight 600, `--ink-2`. An optional field marks
  itself "optional" in `--muted` at the end of the label — required fields are never starred.
- Help text `--fs-sm --muted` under the control; error text `--fs-sm` in `--danger-ink` replacing it, with
  `aria-invalid` and `aria-describedby` wired by `FormControl` automatically.
- A disabled control always carries a `title` saying **why** it is disabled.
- Form footer: a `--line` rule, then buttons right-aligned, primary right-most, `--space-2` apart. A form with
  unsaved changes shows "Unsaved changes" in `--fs-sm --muted` at the left of that row and warns on navigation.
- Submitting sets the button to `aria-busy` with a spinner and a present-tense label ("Saving…"), and never
  disables the whole form.

### 19.2 Staff console (`/admin`)

Density goes up, nothing else changes. `--row-h-dense` rows, `--control-h-sm` controls, `--fs-sm` body,
`--gutter` 16 px page padding.

- Shell: a 220 px left rail of sections, `--surface`, `border-right: 1px solid var(--line)`, items 30 px with a
  16 px icon; the active item gets `--row-selected` and a 2 px `--brand-royal` left rail. It collapses to icons
  under 1100 px and to a Sheet under 900 px.
- Every list is the section 12 table plus a toolbar row: search `input-group`, filter Selects, and a right-side
  primary "New …". Bulk selection uses the Radix Checkbox in a 32 px first column and raises a **sticky action
  bar** at the bottom of the wrapper ("3 selected — Rejudge, Rescore, Delete") rather than a floating toolbar.
- Destructive actions always route through an AlertDialog naming the object and the count.
- Every edit form ends with the revision **reason** field (SPEC section 8), a required single-line input above
  the footer, with its own help text.
- Job progress (rejudge, rescore, rating) renders as a panel with a Progress bar, a mono "412 / 1,308"
  counter, an elapsed timer and a Cancel ghost button — the same component the submission page uses.
- `min-h-0` is set on every flex and grid child in the console shell, and every bar is `shrink-0`, so a long
  table can never push the toolbar off screen.

---

## 20. Empty states, loading, toasts, dialogs

### 20.1 Empty states

The `empty` component: a centred column inside a **dashed frame** — `border: 1px dashed var(--line-strong)`,
`--radius`, `background: var(--bg-2)`, `padding: var(--space-7) var(--space-5)`.

- A 40 px rounded-square media slot, `--surface-2`, holding a 20 px Lucide icon in `--ink-2`.
- Title in the **display face** at `--fs-h3` — the author's own move, and it stops an empty state reading like
  an error.
- One sentence in `--fs-sm --muted` that says what would fill this space.
- At most one action, a secondary button.

The copy is specific and states the next action, never "No data":

| Where | Copy |
| --- | --- |
| filtered problem list | "No problems match these filters." + **Clear filters** |
| a user's submissions | "*username* hasn't submitted anything yet." |
| own submissions | "You haven't submitted anything yet." + **Browse problems** |
| contests list | "No contests are scheduled right now." + **Past contests** |
| comments | "No comments yet — be the first." |
| search | "No matches for *query*." |
| ranking, frozen | "The scoreboard is frozen until the contest ends." |

Counts are pluralised correctly (`1 submission` / `2 submissions`), indices are zero-padded (`#03`), missing
values are an em-dash `—`, and every number is `tabular-nums`.

### 20.2 Loading

- **A list whose shape is known loads as a skeleton in that shape** — eight rows at `--row-h` with bars at the
  real column widths, not a centred spinner. The skeleton is the author's shimmer, not a pulse: a 90-degree
  three-stop gradient (`--surface-2` -> `--surface-3` -> `--surface-2`) at `background-size: 200% 100%`
  animated from `-200% 0` to `200% 0` over 1.6 s linear.
- **An action in flight is words, not a spinner**: "Judging…", "Rejudging 412 submissions…", "Rendering PDF…".
  The button keeps its width and its label changes tense.
- Route changes show a 2 px `--brand-royal` bar at the top of the content column, appearing only after 120 ms
  so fast navigations never flash it.

### 20.3 Toasts

`sonner`, bottom-right (bottom-centre under 700 px), 5 s, at most 3 visible, dismissible.

Toasts are for **things that happened elsewhere or asynchronously**: "Submission #412 finished — Accepted",
"Rejudge queued", "Copied to clipboard" is *not* a toast (it is the inline check on the Copy button), and a
form error is *not* a toast (it belongs on the field). Panel: `--surface`, `1px solid var(--line)`,
`--radius`, `--shadow-2`, a 3 px left rail in the family colour, a 16 px icon, a title at `--fs-base` 500 and
an optional line at `--fs-sm --muted`, plus an optional single action link. Enter `translateY(8px)` +
fade over `--dur`/`--ease`.

### 20.4 Dialogs

Recipe in section 11.4. Rules: a dialog is for a decision or a short form, never for content that has a URL.
Confirmations name the object and the consequence ("Delete problem *AB Subs*? Its 1,308 submissions will be
kept but hidden."). The cancel button holds focus on open. `Esc` and a backdrop click close anything
non-destructive; a destructive dialog ignores the backdrop click. Body scroll locks; focus returns to the
trigger on close.

---

## 21. Code editor

CodeMirror 6, in `/problem/[code]/submit` and the contest workspace.

- Theme built from the tokens, not `oneDark`: background `--code-bg`, text `--ink`, caret `--accent`,
  selection `--accent` at 25%, active line `--surface-2` at 40%, gutters `--code-bg` with `--muted` numbers
  and no border, `&.cm-focused { outline: none }` (the frame carries the focus ring instead).
- `font-family: var(--font-mono)`, `font-size: 13.5px`, `line-height: 1.55`, `padding: 12px 0`.
- `basicSetup` with `lineNumbers`, `foldGutter: false`, `autocompletion`, `bracketMatching`, `closeBrackets`,
  `indentOnInput`, `highlightActiveLine`.
- The editor panel fills its column: `flex: 1; min-height: 0`, with the language Select and a mono
  character/line count in a 36 px header, and the actions bar (`Ctrl+Enter` to submit) `shrink-0` at the
  bottom. The results strip below it is capped at `max-height: 40%` and scrolls, so a long compile error can
  never push the editor off screen.
- Draft code autosaves to `localStorage` 800 ms after the last keystroke, keyed by problem + language.

### 21.1 The nav yields to the work surface

On `/problem/[code]/submit` and inside the contest workspace, the 44 px nav collapses after 1500 ms
(`translateY(-100%)` over `--dur-slow`/`--ease-out`), leaving a 24 px notch tab centred at the top —
`--nav` background, `border-radius: 0 0 var(--radius) var(--radius)`, a 14 px `chevron-down`. It re-reveals on
hover within the top 28 px **and** the middle third of the viewport width, so the corners stay clickable, and
hides again past 140 px. The ContestBar never collapses; the countdown must always be visible.

---

## 22. Responsive

Breakpoints are DMOJ's, kept so ported markup behaves: **760 px** (nav becomes a hamburger), **700 px** (the
two-column split collapses), plus **900 px** (filter panels become sheets) and **1100 px** (the staff rail
collapses to icons).

- The page body never scrolls horizontally. Wide content scrolls inside its own `overflow-x: auto` wrapper.
- Under 700 px the problem list and submission list **reflow into stacked rows** rather than scrolling: title
  on line one with the state icon, then a mono meta line (points · AC % · users), then the verdict pill for
  submissions. Rankings and the scoreboard stay tabular and scroll, with the first column sticky.
- Touch targets are 44 px minimum: the hamburger, the mobile nav rows, pagination buttons, the filter sheet's
  option rows and every icon-only control get `min-height: 44px` even where the desktop size is 26 or 32 px.
- Inputs keep `font-size: 16px` under 768 px (`text-base md:text-[--fs-base]`) so iOS does not zoom on focus.
- The ContestBar's chips scroll horizontally with `scroll-snap-type: x proximity`; the countdown never moves.
- `100dvh`, not `100vh`, anywhere a full-height layout meets a mobile browser chrome.

---

## 23. Do not

- **No gradients on buttons, chips, pills, badges, tables or nav items.** The only gradient in the product is
  the one already inside `logo.svg`. No shimmer sweep on a button, no metallic fill.
- **No purple-to-blue "AI" gradients**, no glow, no aurora, no glass. This is a judge.
- **No emoji.** Not in empty states, not in toasts, not in the olympics scoreboard theme, not in commit
  messages that touch this design system.
- **No rounded-everything.** 4 px is the radius; pills are only for values (verdicts, chips, tags, counts);
  cards are not 16 px-round; nothing is a circle except an avatar.
- **Nothing moves on hover** — no lift, no scale, no shadow bloom. Media inside a frame may scale; the frame
  may not.
- **No shadow on a resting surface.** Panels, cards, tables and side boxes are a hairline on a surface.
- **No native `<select>`, checkbox, radio, date, file or range input**, anywhere, including the staff console
  and the footer language switcher.
- **No `transition: all`**, and no bezier that is not one of the four tokens.
- **No colour as the only signal** — every verdict, state and rating carries text or an icon too.
- **No spinner where a skeleton fits**, and no skeleton where a word fits.
- **No toast for something the user just did in front of them.**
- **No `z-index` literal** outside the `--z-*` scale, and never a `z-[9999]`.
- **No hard-coded hex** in a component. Every colour comes from `tokens.css`.
- **No hover-only affordance** — every hover state has a `:focus-visible` twin.
- **No uppercase nav items** (DMOJ's), no ALL-CAPS sentences, no `text-transform: uppercase` outside `.label`.
- **No infinite animation** except the judging pulse, and it is disabled under reduced motion.
- **No blocking spinner over the whole page** on navigation.

---

## 24. Reviewer checklist

Run this against screenshots of a built page. Every line is pass/fail.

**Chrome**
1. Nav is exactly 44 px, `#101A3D`, with a 3 px `#4169E1` keyline under it.
2. Nav items are sentence case; the current section has both a tint and a 2 px royal underline.
3. At 1280 px, 1024 px and 800 px the nav never wraps and never collides with the user block; surplus items are
   in **More**.
4. Under 760 px there is a hamburger and no visible item list.
5. The username truncates before the avatar or chevron shrinks.
6. In a contest, the ContestBar is directly under the nav at 36 px, and the DMOJ floater is **not** also shown.

**Type**
7. `h1` is 26 px Bai Jamjuree 700 with negative tracking — not 36 px.
8. Every number on the page is monospace and tabular; columns of numbers align on the decimal.
9. Every uppercase label is 11 px / 600 / 0.12em and there is no other uppercase text.
10. Statement headings are visibly smaller than the page title.
11. No text is set in a weight the vendored fonts do not contain.

**Colour**
12. The page ground is plain white; panels are white too, and are told apart by their hairline and their
    navy titlebar rather than by a tinted ground.
13. Nothing on the page is DMOJ's `#3b3b3b`: the header bands are the club's navy, not near-black.
14. A screen of AC submissions shows green *rails*, not green blocks.
15. Every verdict pill has its code visible; IE is dashed.
16. Rating names use the light-mode values and are legible at 12.5 px.
17. Toggle dark mode: no element disappears, no surface is pure black, the nav is still navy, and every
    `--v-*` and `--rating-*` reads at >= 4.5:1.

**Surface**
18. No resting card, panel or table has a `box-shadow`.
19. Every panel has a titlebar and a 1 px border, and its corners clip its header.
20. `--shadow-hard` appears at most once on the page.
21. Table header is the `--titlebar` navy band with `--titlebar-ink` uppercase labels, the same hue as every
    panel titlebar; even rows are `#FAF9F5`; the last row has no rule.
22. A wide table scrolls inside its wrapper — the page body does not scroll horizontally at 375 px.

**Controls**
23. There is no native select, checkbox, radio, date or range input in the DOM (`document.querySelectorAll(
    'select, input[type=checkbox], input[type=radio], input[type=date], input[type=range]')` returns empty).
24. Tab through the page: every interactive element shows the 3 px royal ring, including table rows and
    scoreboard cells, and the ring is never clipped.
25. Buttons are 32 px (26 px dense), 4 px radius, flat fill, no gradient.
26. Every disabled control is at 50% opacity and has a `title` explaining why.
27. Every icon-only control has an `aria-label` and a tooltip.

**Motion**
28. Hovering a card, a row or a button moves nothing.
29. No transition uses `all`; every duration is 120/300/500/620 ms and every curve is one of the four tokens.
30. With `prefers-reduced-motion: reduce` set: nothing animates, nothing is stranded blurred or invisible, and
    the judging pulse is a static dot.
31. Scroll a long list fast to the bottom, then screenshot: no row is stuck invisible.
32. Stagger on any list completes within 300 ms.

**Behaviour**
33. `Ctrl+K` opens the palette from every page; `?` opens the shortcut sheet and everything in it works.
34. An empty list shows a dashed frame, a display-face title, a specific sentence and at most one action.
35. A loading list shows a skeleton in the list's own shape.
36. Copy on a sample case shows an inline check, not a toast.
37. A form error appears on the field, not in a toast.
38. Every count is pluralised, every missing value is an em-dash.
39. At 375 px the problem list is stacked rows, not a horizontally scrolled table, and every tap target is
    >= 44 px.
40. Focus an input at 375 px on iOS: the page does not zoom.
