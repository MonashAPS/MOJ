# Feeds and integrations

MOJ publishes the same feeds DMOJ does, at the same URLs, so an existing subscription keeps working after a
migration. Everything on this page is public and unauthenticated: a feed is always built as though nobody were
signed in, so a private problem or a hidden blog post never appears in one, whoever fetches it.

The examples use `https://judge.example.org`. Substitute your own site.

## The feeds

| Feed | URL | Format |
| --- | --- | --- |
| New problems | `/feed/problems/rss/` | RSS 2.0 |
| New problems | `/feed/problems/atom/` | Atom 1.0 |
| Comments | `/feed/comment/rss/` | RSS 2.0 |
| Comments | `/feed/comment/atom/` | Atom 1.0 |
| Blog posts | `/feed/blog/rss/` | RSS 2.0 |
| Blog posts | `/feed/blog/atom/` | Atom 1.0 |
| Contest calendar | `/contests.ics` | iCalendar |
| Sitemap | `/sitemap.xml` | XML sitemap |

The RSS and Atom versions of a feed carry the same items with the same content; pick whichever your reader
prefers. Atom is the better choice for anything that cares about update timestamps, since it distinguishes
published from updated.

Each feed carries the 25 most recent items. Every one of them is served with a five-minute cache header.

Absolute links in the feeds, the calendar and the sitemap come from `NEXT_PUBLIC_SITE_URL` when it is set and
`NEXT_PUBLIC_APP_URL` otherwise, so a site behind a proxy that terminates on a different name can be corrected
without touching anything else.

Check one from the command line before you point a bot at it:

```bash
curl -s https://judge.example.org/feed/problems/atom/ | head -40
```

### New problems

The 25 most recently published public problems, newest first, by publish date.

| Item field | Contents |
| --- | --- |
| `title` | The problem name. |
| `link` | The absolute URL of the problem, `/problem/<code>`. |
| `guid`, Atom `id` | The same URL. |
| `description`, Atom `summary` | The rendered statement, cut to 500 characters, with an ellipsis. |
| `pubDate`, Atom `published` and `updated` | The problem's date. |

Organisation-private problems are never in it.

### Comments

The 25 most recent comments visible to a signed-out visitor, across problems, contests, blog posts and editorials.

| Item field | Contents |
| --- | --- |
| `title` | `username -> page title`. |
| `link` | The absolute URL of the comment on its page, with the comment anchor. |
| `guid`, Atom `id` | The same URL. |
| `description`, Atom `summary` | The rendered comment body. |
| `pubDate`, Atom `published` | When the comment was posted. |

Hidden comments, comments on pages the public cannot see, and comments whose target no longer exists are left
out.

### Blog posts

The 25 most recent visible blog posts whose publish date has passed, sticky posts first, then newest first.

| Item field | Contents |
| --- | --- |
| `title` | The post title. |
| `link` | The absolute URL, `/post/<id>-<slug>`. |
| `guid`, Atom `id` | The same URL. |
| `description`, Atom `summary` | The rendered summary, or the rendered body when the post has no summary. |
| `pubDate`, Atom `published` | The publish date, not the creation date. |

This is the feed to subscribe an announcements channel to, because contest announcements are blog posts.

## The contest calendar

`/contests.ics` is an iCalendar file with one event per visible contest, in start order.

| Event property | Contents |
| --- | --- |
| `UID` | `contest-<key>@<site host>`, stable, so an edited contest updates rather than duplicating. |
| `SUMMARY` | The contest name. |
| `DTSTART`, `DTEND` | The contest's start and end, in UTC. Your calendar converts to local time. |
| `DTSTAMP` | When the file was generated. |
| `URL` | The absolute URL of the contest page. |
| `DESCRIPTION` | The contest's summary, when it has one. |

Subscribe to it rather than downloading it, so that new contests appear on their own. Downloading imports a
snapshot that never updates.

**Google Calendar**: Other calendars, then **From URL**, and paste
`https://judge.example.org/contests.ics`. Google refreshes subscribed calendars on its own schedule, which is
often several hours, so a contest announced the same morning may not show up in time. Treat it as a planning
tool, not a reminder.

**Apple Calendar**: File, then **New Calendar Subscription**, paste the same URL, and set the refresh interval.
Apple lets you choose, so five minutes or an hour is available if you want it.

**Thunderbird**: New Calendar, **On the Network**, iCalendar (ICS), paste the URL.

**Command line**, for a script that wants to know what is on:

```bash
curl -s https://judge.example.org/contests.ics | grep -E '^(SUMMARY|DTSTART|DTEND):'
```

Contests you cannot see are not in the file. A contest private to an organisation is absent for everyone, since
the file is generated without a signed-in user.

## The sitemap

`/sitemap.xml` is built on each request and lists the home page, the about page, every public problem, every
published public editorial, every visible blog post, every visible public contest, every organisation and every
listed user profile, each with a change frequency and a priority.

It is there for search engines. If you want a machine-readable list of problems for your own tooling, use
[the API](/reference/api) instead, which paginates and filters properly.

## Feeding a chat channel

### Discord

Discord has no built-in RSS reader, so use a webhook and a bot that polls.

1. In the Discord channel, **Edit Channel**, **Integrations**, **Create Webhook**, and copy the webhook URL.
2. Point an RSS bot at the feed and the webhook.
3. If you would rather not add a bot, a cron job on any box you already run works:

   ```bash
   #!/usr/bin/env bash
   # post-new-blog-posts.sh, run every 15 minutes from cron
   set -euo pipefail

   FEED=https://judge.example.org/feed/blog/atom/
   WEBHOOK=https://discord.com/api/webhooks/...
   STATE=$HOME/.cache/moj-blog-feed.seen
   mkdir -p "$(dirname "$STATE")"
   touch "$STATE"

   curl -s "$FEED" \
     | grep -oP '(?<=<link href=")[^"]+' \
     | while read -r url; do
         grep -qxF "$url" "$STATE" && continue
         echo "$url" >> "$STATE"
         curl -s -X POST -H 'Content-Type: application/json' \
           -d "$(jq -nc --arg c "New on the judge: $url" '{content: $c}')" \
           "$WEBHOOK" > /dev/null
       done
   ```

   Seed the state file once with the current contents of the feed, otherwise the first run posts everything.

### Slack

Slack has a built-in RSS app, so no bot is needed:

```
/feed subscribe https://judge.example.org/feed/blog/atom/
```

Run it in the channel that should receive the posts. `/feed list` shows the channel's subscriptions and
`/feed remove <id>` removes one. The Slack reader polls every few minutes and renders the item summary, which for
the blog feed is the post summary, so write summaries worth reading.

For the problems feed, the same command with `/feed/problems/atom/` gives a channel that announces every new
problem as it goes public. That is a good fit for a practice channel and a bad fit for a general one, because a
problem set landing at once is ten messages in a row.

## Polling politely

The feeds are cheap and are cached for five minutes at the edge, so there is nothing to gain from polling more
often than that. They are not a substitute for the API: a reader that wants to filter, paginate or ask about
something other than the newest 25 items should use [the API](/reference/api).
