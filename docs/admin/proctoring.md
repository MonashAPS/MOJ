# Proctoring

A contest can require a competitor to share their whole screen while its problems are open. The recording is
stored by MOJ and watched from the staff console. Chromium browsers only.

Joining is never blocked. Reading a problem and submitting to one are: being in a contest is what makes its
problems readable whatever their own visibility says, and that is what proctoring withholds. A problem that is
public stays public.

## Turning it on

Console, Contests, the contest, **Proctoring**, then tick **Require screen sharing**.

## What a competitor does

They open `/proctor/` and share their **entire screen**; a window or a tab is refused. The page must stay open.
Closing it, or stopping the share from the browser's own bar, closes the contest's problems within thirty
seconds.

Proctoring is a state the account is in, not something a contest owns, so one session covers every contest they
touch and can be started before a contest begins.

## Watching

Console, **Proctoring**. Sessions appear as soon as somebody starts sharing. Opening one gives a player with
**Follow live**, a clickable timeline, and gaps drawn where a slice never arrived.

## Storage

Budget roughly 180 MB per competitor-hour: a field of sixty over three hours is about 30 GB. Recordings are
swept every six hours once they pass the retention period, which defaults to 30 days; the sweep deletes the
video and keeps the session record. A retention of zero keeps recordings for ever.

## What it does not do

It does not lock the machine down, and it sees one screen: a second machine, a phone or an unshared monitor are
outside it. Verification is per account, so while a session is live, requests made as the same account from
somewhere else are covered by it.

::: danger
Recording somebody's whole screen needs explicit consent and a stated retention period, told to competitors
before the contest rather than on the day.
:::
