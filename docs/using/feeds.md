# Feeds

Every feed is public and is built as though nobody were signed in, so a private problem or a hidden post never
appears in one. Each carries the 25 most recent items and is served with a five-minute cache header.

| Feed | URL | Contents |
| --- | --- | --- |
| New problems | `/feed/problems/rss/`, `/feed/problems/atom/` | The most recent public problems by publish date, summarised by the rendered statement cut to 500 characters. |
| Comments | `/feed/comment/rss/`, `/feed/comment/atom/` | The most recent comments a signed-out visitor can see, titled `username -> page title`. |
| Blog posts | `/feed/blog/rss/`, `/feed/blog/atom/` | The most recent visible posts whose publish date has passed, sticky first. Contest announcements are blog posts. |
| Contest calendar | `/contests.ics` | One event per visible contest, in start order, with a stable `UID`, `DTSTART` and `DTEND` in UTC, and the contest page as `URL`. |
| Sitemap | `/sitemap.xml` | The home and about pages, every public problem, published public editorial, visible post, visible public contest, organisation and listed profile. |

The RSS and Atom versions of a feed carry the same items; Atom distinguishes published from updated. Absolute
links come from `NEXT_PUBLIC_SITE_URL` when it is set and `NEXT_PUBLIC_APP_URL` otherwise.

```bash
curl -s https://judge.example.org/feed/problems/atom/ | head -40
```

Subscribe to `/contests.ics` rather than downloading it, or it never updates: Google Calendar under Other
calendars, **From URL**; Apple Calendar under File, **New Calendar Subscription**; Thunderbird under New
Calendar, **On the Network**.

Slack has a built-in reader — run `/feed subscribe https://judge.example.org/feed/blog/atom/` in the channel
that should receive the posts. Discord has none: use an RSS bot pointed at a channel webhook.

::: tip
The feeds are cached for five minutes, so polling faster gains nothing. A reader that wants to filter, paginate,
or ask about more than the newest 25 items should use [the API](/reference/api).
:::
