# Staff console

`/admin` is where everything that is not a user action happens. It replaces DMOJ's Django admin, and the sections
map onto the things DMOJ kept there, so if you knew the old admin you know this one.

Access needs the staff flag, and the staff flag requires two-factor authentication; see
[accounts and 2FA](/using/accounts). Beyond that, every section checks the same permission codes DMOJ used, so a
problem setter with `judge.edit_own_problem` sees the problems section but only their own problems, and the
controls they cannot use are not rendered rather than failing on click.

The console is denser than the public pages on purpose. Every list has a search box, the filters that matter for
that entity, and pagination, and every list is a live subscription, so a queue you are watching updates while you
watch it.

## The sections

The rail groups them four ways: judging, people, machines and the site. Branding is the one page not on the
rail; it is reached from Config.

### Problems

`/admin/problems` lists every problem you may edit, with search by code or name and filters for group, type,
author and visibility. **New problem** creates one.

The editor at `/admin/problems/<code>` has tabs for General, Statement, Editorial, Translations, Language limits,
Clarifications, Test data, Revisions and Actions. It covers everything `config.json` sets plus the parts a
repository cannot: the group and the types, the allowed languages, per-language time and memory limits, the
licence, the organisations a problem is private to, the submission source visibility, and whether the problem is
manually managed.

Problems written in a [problem repository](/problems/repos-and-ci) are usually only touched here to set the group
and the types after the first upload, since the API deliberately does not overwrite those.

The Test data tab links to the public editor at `/problem/<code>/test_data/` rather than duplicating it, because
that editor validates the archive as you go.

Actions holds rejudge, rescore, visibility, clone and the revision history. Cloning copies the statement, the
limits and the taxonomy under a new code, private, with you as its only author; it copies no test data and no
submissions.

### Contests

`/admin/contests` lists contests with their times, format, problem count, entrant count and state.
`/admin/contests/<key>` has tabs for General, Problems, People, Actions and Revisions.

The Problems tab is where contest problem points, partial scoring, pretested flags, output prefix overrides,
maximum submissions per problem and the label scheme are set. Reordering here changes the labels.

Actions covers rating, rescoring, locking and cloning, and lists the contestants.
[Contests](/using/contests) explains what each of those means.

### Submissions

Every submission on the site, filtered by user, problem, contest, judge, status, result, language and a
submission id range. Opening a row shows its source and lets you rejudge it.

The filters are also the batch: **Batch rejudge** turns the current filter into a job, shows how many submissions
it matches before you confirm, and then renders its progress inline. Only one problem can be batch-rejudged at a
time. A batch rejudge runs in chunks, so a rejudge of a few thousand submissions does not block anything.

A submission locked by its contest is refused unless you are a superuser, and says so.

### Jobs

Every background job: rejudges, rescores, contest ratings, MOSS runs, data exports, PDF renders and sitemap
builds. Each row shows the type, the target, the status, a live progress bar with a done-of-total count, the
stage it has reached, who started it and any error.

This is the first place to look when a rejudge seems to have stopped. A failed job shows its error rather than
disappearing. Nothing polls: the list is a subscription like everything else.

### Scoreboards

The hall scoreboard events. Each one has a key that becomes its URL, a name, the contests that become its
divisions, a theme, a flag URL template, the organisations that become badges, which of those means in-person, a
freeze in minutes and whether the event is public.

A scoreboard event is always ICPC scored whatever its contests use, and it ignores contest scoreboard visibility.
Creating one makes those standings readable at `/scoreboard/<key>` by anyone with the link.

### Users

`/admin/users` filters accounts by role, display rank and state, with a search over username and email.

`/admin/users/<username>` has tabs for Profile, Permissions, Account, API keys and History. It edits the profile,
grants permissions, resets two-factor, revokes sessions and passkeys, and bans or unbans an account. Banning
revokes every session and hides the profile from the leaderboard; nothing is deleted.

Permissions are DMOJ's codes verbatim, so `judge.see_private_contest`, `judge.rejudge_submission`,
`judge.view_all_submission` and the rest mean what they meant. Granting staff sends that user to the two-factor
setup page on their next request.

Superusers can impersonate a user, which is the fastest way to reproduce "I cannot see this problem".
Impersonation shows a banner and a **Stop impersonating** item in the user dropdown.

### Organizations

Organisations are the clubs, cohorts and schools users belong to. Edit the name, slug, short name, description,
whether it is open to join, the member slots, the access code, the logo and the administrators.

`/admin/organizations/<slug>` has tabs for Details, Classes, Join requests and History. Note that only an
organisation's own administrators may review its join requests, which follows DMOJ: being a superuser is not
enough.

Organisation membership is what drives badges on [the hall scoreboard](/using/contests#the-hall-scoreboard), so
the in-person badge for an on-site contest is an organisation whose members you add on the day.

### Classes

Classes are subdivisions of an organisation, with their own administrators and members. They exist so that a
contest can be restricted to one tutorial group rather than the whole organisation. Pick the organisation first;
classes live inside one.

### Tickets

The ticket queue: user reports about problems, usually a broken statement or bad test data. Reassign, close or
delete. A ticket linked to a problem appears on that problem's page for its authors.

### Judges

Every judge with its status, tier, ping, load, problem count, runtimes, last seen and address.

Creating a judge is where you get its authentication key. It is generated there and shown once, and the site
stores only its SHA-256, so a lost key is replaced rather than recovered. **Issue a new key** makes a new one and
disconnects the judge until it is restarted with the new value.

Per judge you can also **Disable** it, which stops the site handing it work while leaving it connected;
**Block** it, which rejects its calls entirely, for a judge that is misbehaving or whose key you think leaked; and
**Disconnect** it. Because the judge polls rather than holding a socket, a disconnect is a request it picks up at
its next heartbeat rather than a packet pushed down a connection.

The problem codes and runtimes a judge reported are listed on its row. That list is the answer to "why is this
submission not being picked up".

### Languages

The languages the site knows about: key, name, short name, common name, file extension, editor mode and
highlighting language. You can also copy one language's problem set onto another, which is DMOJ's
`copy_language` management command; note that it replaces the target's set rather than adding to it.

A language existing here does not mean it can be submitted. The submit page offers a language only when an online
judge reports a runtime for it, so removing a language from every judge removes it from the site without editing
anything here.

### API keys

`/admin/api-keys` mints and revokes API keys for your own account, with the scopes each one carries, when it was
last used and when it expires. The key is shown once.

The page also prints the problems API base URL for this deployment and a ready-made workflow snippet, which is
worth pasting into a problem repository as-is. The base URL is this site's own address: the problems API is a
Convex HTTP action, but the site proxies `/api/problems/*` through to it, so `JUDGE_URL` in a repository's secrets
is exactly the address you have in the browser.

### Navigation

The navigation bar, as an ordered tree: label, path, the regex that decides when the item is highlighted, and the
parent for dropdown items. This is DMOJ's navigation model, and it is why the nav is editable without a deploy.

### Config

Two tabs. **Site settings** covers identity, account rules, submission limits, points and ratings, page sizes and
community settings. **Misc config** is DMOJ's key and value store, read by name: the announcement box, the footer
text, the analytics snippet, the header above the problem list.

### Branding

`/admin/config/branding`, linked from the Config page, is how a site is rebranded without touching code. It sets the site name and long name,
the wordmark and the favicon, the accent colour and the nav colour, the default theme, and a block of custom CSS
that is appended after everything else.

A live preview beside the form shows a nav bar, a button, a link and a table header in the chosen colours, and
warns when the contrast is too low to read. Dark-mode variants are computed from what you set, so there is one
pair of colours to choose rather than four.

Leaving a field empty restores the bundled default, and replacing an upload deletes the old one. Only superusers
may save this page. Reload after saving to see it applied across the site.

Fonts are not settings. An operator who wants different faces adds `@font-face` rules through the custom CSS.

### Flat pages

Static pages served by URL, such as `/about/`. Each has a URL, a title, markdown content, and whether comments are
enabled. They are how a site's rules and contact pages are kept without a deploy.

### Blog

Blog posts: title, slug, authors, publish time, whether visible, whether sticky, the summary used in feeds and
lists, and the body. Posts appear on the home page, at `/blog/` and in the [blog feed](/using/feeds).

Setting a publish time in the future schedules a post; it stays invisible until then.

### Licenses

The licences a problem can be published under: key, name, display text and the full text shown at
`/license/<key>`.

### Tags

Contest tags, with a name, colour and description. They group contests on `/contests/` and appear on contest
cards.

## Revisions

Every edit made in the staff console writes a revision: a snapshot of the entity, who made it, when, and the
reason typed into the reason field.

Every edit form ends with that reason field, and it is not optional. One word is enough. Six months later, "test
data was wrong for case 7" on a problem edit is the difference between understanding a rescore and guessing at
it. A handful of one-click row actions, such as blocking a judge, record a fixed reason instead of asking.

Problems, contests, users and organisations show their history in the console. On a problem or a contest the
panel is a comparison view: pick any two revisions and it lists the fields that changed, with the old value struck
through. The server stores whole snapshots rather than diffs, which is what makes any two of them comparable.

What revisions do not cover: they record staff edits, not user actions. A submission is not an edit, a contest
join is not an edit, and a problem uploaded through the problems API records the upload rather than a full
history of the statement. For that, use the problem repository's git history, which is what it is for.

## When part of the console is degraded

The console reads through a handful of Convex modules of its own. If a deployment has the web app but not yet
those modules, the console does not fail: it falls back to the public queries, tells you so in a notice at the
top of the page, and disables the filters it cannot answer. Types, authors, judge names and the revision history
are what go missing. Everything you can edit still saves.

That state is a deployment that is halfway through an update. Push the Convex functions and it clears.
