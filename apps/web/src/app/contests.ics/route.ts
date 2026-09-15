// `/contests.ics`: the visible contests as an iCalendar feed (RFC 5545).

import { api } from "@convex/_generated/api";
import { siteUrl } from "@/app/feed/xml";
import { query } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

/** RFC 5545 escaping: backslash, semicolon, comma and newline. */
function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function stamp(time: number): string {
  return `${new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")}`;
}

/** Content lines are folded at 75 octets, continuations start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);

  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let size = 0;

  for (const character of line) {
    const width = new TextEncoder().encode(character).length;

    if (size + width > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }

    current += character;
    size += width;
  }

  if (current) out.push(current);

  return out.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export async function GET() {
  const [contests, site] = await Promise.all([
    query(api.feeds.contests, {}).catch(() => []),
    query(api.feeds.site, {}).catch(() => ({
      siteName: "MOJ",
      siteLongName: "MOJ, the MAPS Online Judge",
    })),
  ]);

  const host = new URL(siteUrl()).host;
  const now = stamp(Date.now());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(site.siteName)}//Contests//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${site.siteName} Contests`)}`,
  ];

  for (const contest of contests) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:contest-${contest.key}@${host}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(contest.startTime)}`,
      `DTEND:${stamp(contest.endTime)}`,
      `SUMMARY:${escapeText(contest.name)}`,
      `URL:${siteUrl()}${contest.link}`,
    );

    if (contest.summary) lines.push(`DESCRIPTION:${escapeText(contest.summary)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(`${lines.map(fold).join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="contests.ics"',
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
