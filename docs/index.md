---
layout: home

hero:
  name: MOJ
  text: the MAPS Online Judge
  tagline: A TypeScript rewrite of DMOJ, run by Monash Algorithms and Problem Solving. Same URLs, same problem format, same accounts, the DMOJ judge-server as the grader.
  image:
    src: /logo.svg
    alt: MOJ
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: Architecture
      link: /guide/architecture
    - theme: alt
      text: Problem format
      link: /problems/format

features:
  - title: Runs the DMOJ judge
    details: The grader is the DMOJ judge-server with a replacement packet layer. Problem data written for DMOJ runs unchanged, including batches, checkers, graders and generators.
  - title: Imports an existing DMOJ site
    details: Users with their password hashes, TOTP secrets, passkeys, problems, submissions, contests, ratings, comments and blog posts move across from a MariaDB dump.
  - title: Live without polling
    details: Submission status, contest rankings, the hall scoreboard and judge status are Convex reactive queries, so pages update as the judge reports cases.
  - title: Contest formats from DMOJ
    details: Default, IOI, legacy IOI, AtCoder, ICPC and ECOO, plus scoreboard freeze, blind mode and a reveal ceremony for the hall board.
---

## Where to start

If you want to run MOJ on your own machine, read the [quick start](/guide/quick-start). It installs Docker and
Node, brings up the site and connects a judge.

If you are writing problems, read the [problem format](/problems/format) and
[problem repos and CI](/problems/repos-and-ci).

If you are running the site for a club or a contest, read [contests](/using/contests),
[the staff console](/admin/staff-console) and [deployment](/admin/deployment).

If you are moving an existing DMOJ installation across, read [importing from DMOJ](/admin/import).
