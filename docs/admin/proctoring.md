# Proctoring

A contest can be set to open its problems only while the competitor is sharing
their whole screen. The recording is stored by MOJ and watched from the staff
console. Chromium browsers only.

## What it gates

Joining is never blocked. Reading a problem and submitting to one are.

Being in a contest is what makes its problems readable whatever their own
visibility says, and that is what proctoring withholds. A problem that is public
stays public; one that is not is reachable only through the contest, and so only
while sharing.

## Turning it on for a contest

Console, Contests, the contest, Proctoring. Tick **Require screen sharing**.

## What a competitor does

They open `/proctor/` and share their **entire screen**. A window or a tab is
refused. The page must stay open: closing it, or stopping the share from the
browser's own bar, closes the contest's problems within thirty seconds.

Proctoring is a state the account is in rather than something a contest owns, so
one session covers every contest they touch, and they can start one before a
contest begins.

## Watching

Console, Proctoring. Sessions appear as soon as somebody starts sharing and stop
reading as live when they go quiet. Opening one gives a player with **Follow
live**, a timeline you can click, and gaps drawn where a slice never arrived.

## Storage

Recordings are the largest thing MOJ stores. Budget roughly 180 MB per
competitor-hour, so a field of sixty over three hours is about 30 GB.

They are swept every six hours once they pass the retention period, which
defaults to 30 days. The sweep deletes the video and keeps the session, so who
shared and when stays on the record. Setting the retention to zero keeps
recordings for ever.

## What it does not do

It does not lock the machine down. A competitor can run anything they like; the
recording simply shows it.

It sees one screen. A second machine, a phone, or a second monitor that is not
the one being shared are all outside it.

Verification is per account, not per device. While a session is live, requests
made as the same account from somewhere else are covered by it.

Recording somebody's whole screen wants explicit consent and a stated retention
period, told to competitors before the contest rather than on the day.
