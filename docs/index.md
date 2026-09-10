---
layout: home

hero:
  name: MOJ
  text: the MAPS Online Judge
  tagline: A TypeScript rewrite of DMOJ. Same URLs, same problem format, same accounts, the DMOJ judge-server as the grader.
  image:
    src: /logo.svg
    alt: MOJ
  actions:
    - theme: brand
      text: Quick start
      link: /guide/quick-start
    - theme: alt
      text: Compatibility with DMOJ
      link: /guide/compatibility
    - theme: alt
      text: Problem format
      link: /problems/format

features:
  - title: Runs the DMOJ judge
    details: The grader is the DMOJ judge-server, carried as a git subtree with a three-file diff. Problem data written for DMOJ runs unchanged, including batches, checkers, graders and generators.
  - title: Imports an existing DMOJ site
    details: Users with their password hashes, TOTP secrets, passkeys, problems, submissions, contests, ratings, comments and blog posts move across from a MariaDB dump.
  - title: Live without polling
    details: Submission status, contest rankings, the hall scoreboard and judge status are reactive queries, so pages update as the judge reports cases. There is no event daemon to run.
  - title: Contest formats from DMOJ
    details: Default, IOI, legacy IOI, AtCoder, ICPC and ECOO, plus scoreboard freeze, blind mode and a reveal ceremony for the hall board.
  - title: Judges anywhere
    details: A judge polls the site over HTTPS instead of holding a socket open to a bridge, so it needs no inbound port, no static address and no VPN.
  - title: Rebrandable without a deploy
    details: The site name, wordmark, favicon, colours, default theme and custom CSS are settings, so an operator makes the site theirs from the staff console.
---

## Where to start

If you want to run MOJ on your own machine, read the [quick start](/guide/quick-start). It installs Docker and
Node, brings up the site and connects a judge.

If you are coming from DMOJ, [compatibility with DMOJ](/guide/compatibility) is the list of what is the same,
what the importer brings across, and what is deliberately different.

If you are writing problems, read the [problem format](/problems/format) and
[problem repos and CI](/problems/repos-and-ci).

If you are running the site, read [contests](/using/contests), [the staff console](/admin/staff-console) and
[deployment](/admin/deployment).

If you are moving an existing DMOJ installation across, read [importing from DMOJ](/admin/import).

MOJ is maintained by MAPS, Monash Algorithms and Problem Solving, and is free software under the AGPL-3.0. It is
built to be run by anyone: nothing about a MOJ install assumes whose it is.
