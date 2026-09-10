# Staff console

`/admin` is where everything that is not a user action happens. It replaces DMOJ's Django admin, and the sections
map one to one onto the things DMOJ kept there, so if you knew the old admin you know this one.

Access needs the staff flag, and the staff flag requires two-factor authentication; see
[accounts and 2FA](/using/accounts). Beyond that, every section checks the same permission codes DMOJ used, so a
problem setter with `judge.edit_own_problem` sees the problems section but only their own problems, and the
buttons they cannot use are not rendered rather than failing on click.

Every list has a search box, the filters that matter for that entity, and pagination. Every list is live, so a
queue you are watching updates while you watch it.

## Sections

### Problems

Create, edit and retire problems. The form covers everything `config.json` sets plus the parts a repository cannot:
the problem group and types, the allowed languages, per-language time and memory limits, the license, the
organisations a problem is private to, the submission source visibility, and whether the problem is manually
managed.

Problems written in a [problem repository](/problems/repos-and-ci) are usually only touched here to set the group
and types after the first upload, since the API deliberately does not overwrite those.

The test data view mirrors `/problem/<code>/test_data`: it lists the cases the judge will run, so you can check
that a data push landed without opening a shell on a judge box.

### Contests

Create and edit contests: times, format and format configuration, problems and their points and labels, access
control, the freeze, ratings, and the tester and spectator lists.

The problems table is where contest problem points, partial scoring, pretested flags, output prefix overrides,
maximum submissions per problem and the label scheme are set. Reordering here changes the labels.

Actions on a contest: rate it, rescore it, clone it into a new key, run MOSS over it, and lock it.
[Contests](/using/contests) explains what each of those means.

### Submissions

Every submission on the site, filtered by user, problem, contest, language, result and date.

The actions are rejudge one, rejudge a filtered set, and rescore. A single rejudge puts the submission back in the
queue at rejudge priority. A batch rejudge creates a job and processes in chunks of 100, so a rejudge of a few
thousand submissions does not block anything and its progress bar is live.

Rejudging a submission that is currently being graded is refused rather than queued; abort it first.

### Users

Search users, edit profiles, set the display rank, ban a user from voting on problems, mute them, mark them
unlisted, and edit their permissions and group memberships.

Permissions are DMOJ's codes verbatim, so `judge.see_private_contest`, `judge.rejudge_submission`,
`judge.view_all_submission` and the rest mean what they meant. Granting staff sends that user to the two-factor
setup page on their next request.

Superusers can impersonate a user, which is the fastest way to reproduce "I cannot see this problem". Impersonation
shows a banner and a **Stop impersonating** item in the user dropdown, and it is recorded.

### Organisations

Organisations are the clubs, cohorts and schools users belong to. Edit the name, slug, short name, description,
whether it is open to join, the member slots, the access code, the logo, and the administrators.

Pending join requests are handled here, with the request log split into pending, approved and rejected.

Organisation membership is what drives badges on [the hall scoreboard](/using/contests#the-hall-scoreboard), so
the in-person badge for an on-site contest is an organisation whose members you add on the day.

### Classes

Classes are subdivisions of an organisation, with their own administrators and members. They exist so that a
contest can be restricted to one tutorial group rather than the whole club.

### Judges

The list of judges, their tier, whether they are online, their ping, their load and what they are grading right
now.

Creating a judge is where you get its authentication key. The key is shown once and stored as a SHA-256 hash;
regenerating it makes a new one and disconnects the judge until it is restarted with the new value.

Two switches matter operationally. **Disabled** stops the site handing that judge work while leaving it connected.
**Blocked** rejects its calls entirely, which is what to use if a judge is misbehaving or you suspect its key
leaked.

The problem codes and runtimes a judge reported are listed on its page. That list is the answer to "why is this
submission not being picked up".

### Languages

The languages the site offers: key, name, short name, common name, editor mode, syntax highlighting language, file
extension, the template inserted into an empty editor, and the description shown on `/runtimes/`.

A language existing here does not mean it can be submitted. The submit page offers a language only when an online
judge reports a runtime for it, so removing a language from every judge removes it from the site without editing
anything here.

### Navigation

The navigation bar, as an ordered tree: label, path, the regex that decides when the item is highlighted, and the
parent for dropdown items. This is DMOJ's `NavigationBar` model, and it is why the nav is editable without a
deploy.

### Config

The site's miscellaneous configuration, as key and value pairs. This is DMOJ's `MiscConfig`: the announcement box,
the footer text, the analytics snippet, and anything else the templates read by key.

### Flat pages

Static pages served by URL, such as `/about/`. Each has a URL, a title, markdown content, and whether comments are
enabled. They are how the club's rules and contact pages are kept without a deploy.

### Blog

Blog posts: title, slug, authors, publish date, whether visible, whether sticky, the summary used in feeds and
lists, and the body. Posts appear on the home page, at `/blog/` and in the [blog feed](/using/feeds).

Setting a publish date in the future schedules a post; it stays invisible until then.

### Licenses

The licenses a problem can be published under: key, name, display text, icon and the full text shown at
`/license/<key>`.

### Tags

Contest tags, with a name, colour and description. They filter `/contests/` and appear on contest cards.

### Tickets

The ticket queue: user reports about problems, usually a broken statement or bad test data. Assign, comment, and
close. A ticket linked to a problem appears on that problem's page for its authors.

### Jobs

Every background job: rejudges, rescores, contest ratings, MOSS runs, data exports, PDF renders and sitemap
builds. Each row shows the type, the requester, the progress and any error.

This is the first place to look when a rejudge seems to have stopped. A failed job shows its error rather than
disappearing.

### Scoreboards

The hall scoreboard events: the key that becomes the URL, the title, which contests are its divisions, the theme,
the flag URL template, which organisations become badges, which one means in-person, and the freeze.

Remember that a scoreboard event ignores contest scoreboard visibility. Creating one makes those standings public
at `/scoreboard/<key>`.

## Revisions

Every edit made in the staff console writes a revision: a full snapshot of the entity before the change, who made
it, when, and the reason typed into the reason field.

The reason field is not optional, and one word is enough. Six months later, "test data was wrong for case 7" on a
problem edit is the difference between understanding a rescore and guessing at it.

Revisions are visible on each entity, newest first, and can be compared and restored. Restoring writes another
revision rather than deleting history, so a bad restore is itself reversible.

What revisions do not cover: they record staff edits, not user actions. A submission is not an edit, a contest join
is not an edit, and a problem uploaded through the problems API records the upload rather than a full snapshot of
the previous statement. For a full history of a statement, use the problem repository's git history, which is what
it is for.
