# Safe Exam Browser

A contest can be locked so that joining it and submitting to it only work from
[Safe Exam Browser](https://safeexambrowser.org/) running a configuration you
handed out. SEB runs on Windows and macOS.

## How the check works

With "Use Browser & Config Keys (send in HTTP header)" switched on, SEB adds
`X-SafeExamBrowser-ConfigKeyHash` to every request: the base16 SHA-256 of the
requested URL followed by the configuration's Config Key. MOJ holds the key,
recomputes the hash and compares.

MOJ never talks to SEB Server. Anything that produces a Config Key works: SEB
Server, the SEB Configuration Tool, or a `.seb` file you wrote yourself.

## Turning it on

Under Console, Configuration, tick **Allow contests to require Safe Exam
Browser**. Contests grow a Safe Exam Browser tab.

Set `SEB_TICKET_SECRET` in the Convex deployment's environment to any long
random string:

```bash
npx convex env set SEB_TICKET_SECRET "$(openssl rand -hex 32)"
```

A locked contest with no secret set refuses every submission.

## Locking a contest

1. Build the configuration. `infra/seb/proctored.seb` is a starting point; open
   it in the SEB Configuration Tool, set `startURL` to the contest, set a quit
   password, and save.
2. Read the Config Key off the tool's Exam pane.
3. In the contest's Safe Exam Browser tab, paste the key, tick **Require Safe
   Exam Browser**, and give the launch link if you host the `.seb` file
   somewhere.

A contest with the flag set and no keys is not locked. The tab says so.

Config Keys derive from the settings alone, so one key covers Windows and macOS
and every SEB release. Browser Exam Keys also cover the client's code signature:
use them to pin exact builds, one key per build, in the second box.

## What a competitor sees

In SEB with the right configuration, nothing changes.

Anywhere else, every page is replaced by a launch screen for as long as they are
in the contest, with the launch link and a way out of contest mode. The contest's
own page says the same thing before they join.

A missing header and a wrong one read differently on that screen, so someone who
started SEB with last year's configuration is told that rather than being told to
start SEB.

## What it does not do

SEB inspects no traffic. A permitted application keeps full network access, and
SEB's URL filter only applies to SEB's own browser. Blocking where a machine can
reach belongs on the network.

SEB records nothing on its own. Screen capture is [SEB
Server](https://safeexambrowser.org/alpha/sebserver.html), a separate service you
host yourself, which also collects the client event log centrally.

The lock covers joining and submitting. Reading a statement goes through queries
that carry no headers, and a competitor who joined inside SEB could read them
outside it.

Anyone holding the Config Key can compute the header for any URL. It is as
secret as the `.seb` file you distribute, which is what the Configuration Tool's
settings password is for.

## Gotchas

The hash covers the URL exactly as requested. Behind a reverse proxy, pass
`X-Forwarded-Proto` and `X-Forwarded-Host`; `infra/Caddyfile` already does.

`browserURLSalt` must stay on. Off, SEB sends a hash with no URL in it and
nothing matches.

Changing any setting changes the Config Key. Re-read it and paste it again, or
keep both keys in the box during a changeover.
