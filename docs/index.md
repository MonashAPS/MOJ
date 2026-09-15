---
layout: home

hero:
  name: MOJ
  text: the MAPS Online Judge
  tagline: An online judge and contest platform written in TypeScript, compatible with DMOJ. All DMOJ URLs work, the problem format is unchanged, and an existing site imports.
  image:
    src: /logo.svg
    alt: MOJ
  actions:
    - theme: brand
      text: Installation
      link: /guide/installation
    - theme: alt
      text: Compatibility with DMOJ
      link: /guide/compatibility
    - theme: alt
      text: Problem format
      link: /problems/format

features:
  - title: Runs the DMOJ judge
    details: The grader is the DMOJ judge-server, carried as a git subtree. Problem data written for DMOJ grades unchanged.
  - title: Imports an existing DMOJ site
    details: Users, password hashes, TOTP secrets, passkeys, problems, submissions, contests, ratings and comments come across from a MariaDB dump.
  - title: Live without polling
    details: Submission status, contest rankings and judge status are reactive queries. There is no event daemon.
  - title: Contest formats from DMOJ
    details: Default, IOI, legacy IOI, AtCoder, ICPC and ECOO, plus scoreboard freeze, blind mode and a reveal ceremony.
  - title: Judges anywhere
    details: A judge polls the site over HTTPS, so it needs no inbound port, no static address and no VPN.
  - title: Rebrandable without a deploy
    details: Name, wordmark, favicon, colours, default theme and custom CSS are settings in the staff console.
---

![The MOJ home page](/screenshots/home.png)

## Where to start

- [Installation](/guide/installation) — run MOJ on your own machine.
- [Production](/guide/production) — run it on a server, behind TLS.
- [Compatibility with DMOJ](/guide/compatibility) — what is the same, what imports, what differs.
- [Problem format](/problems/format) — `init.yml`, statements and `config.json`.
- [Importing from DMOJ](/admin/import) — move an existing site across.

MOJ is maintained by MAPS, Monash Algorithms and Problem Solving, and is free software under the AGPL-3.0.
