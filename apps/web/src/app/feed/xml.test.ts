import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, test } from "vitest";
import {
  absolute,
  escapeXml,
  type FeedEntry,
  type FeedMeta,
  renderAtom,
  renderRss,
  rfc2822,
  rfc3339,
} from "./xml";

const meta: FeedMeta = {
  title: "Latest MOJ Comments",
  description: 'The latest comments on the "MOJ" website & judge',
  link: "/",
  self: "/feed/comment/rss/",
};

const entries: FeedEntry[] = [
  {
    id: "1",
    title: "solver -> Alpha & Beta",
    link: "/problem/alpha#comment-1",
    descriptionHtml: "<p>A <strong>bold</strong> claim about <code>a &lt; b</code>.</p>",
    published: 1_700_000_000_000,
    updated: 1_700_000_000_000,
  },
  {
    id: "2",
    title: "Sticky post",
    link: "/post/2-sticky-post",
    descriptionHtml: "<p>Body with an ampersand &amp; a <tag>.</p>",
    published: 1_600_000_000_000,
    updated: 1_600_000_100_000,
  },
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

describe("RSS 2.0", () => {
  test("parses back with the channel and items intact", () => {
    const xml = renderRss(meta, entries);
    expect(XMLValidator.validate(xml)).toBe(true);

    const parsed = parser.parse(xml);
    expect(parsed.rss["@version"]).toBe("2.0");

    const channel = parsed.rss.channel;
    expect(channel.title).toBe("Latest MOJ Comments");
    expect(channel.description).toBe('The latest comments on the "MOJ" website & judge');
    expect(channel.link).toBe(absolute("/"));

    const items = channel.item;
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("solver -> Alpha & Beta");
    expect(items[0].link).toBe(absolute("/problem/alpha#comment-1"));
    expect(items[0].pubDate).toBe(rfc2822(entries[0]!.published));
    expect(items[0].guid["@isPermaLink"]).toBe("false");
    // The rendered HTML survives the round trip as text, not as markup.
    expect(String(items[0].description)).toContain("<strong>bold</strong>");
  });

  test("an empty feed is still valid XML", () => {
    const xml = renderRss(meta, []);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(parser.parse(xml).rss.channel.item).toBeUndefined();
  });
});

describe("Atom 1.0", () => {
  test("parses back with the entries intact", () => {
    const xml = renderAtom({ ...meta, self: "/feed/comment/atom/" }, entries);
    expect(XMLValidator.validate(xml)).toBe(true);

    const parsed = parser.parse(xml);
    const feed = parsed.feed;
    expect(feed["@xmlns"]).toBe("http://www.w3.org/2005/Atom");
    expect(feed.title).toBe("Latest MOJ Comments");
    expect(feed.updated).toBe(rfc3339(1_700_000_000_000));

    expect(feed.entry).toHaveLength(2);
    expect(feed.entry[1].title).toBe("Sticky post");
    expect(feed.entry[1].published).toBe(rfc3339(entries[1]!.published));
    expect(feed.entry[1].updated).toBe(rfc3339(entries[1]!.updated));
    expect(feed.entry[1].summary["@type"]).toBe("html");
    expect(String(feed.entry[1].summary["#text"])).toContain("&");
  });

  test("the self link is distinct from the alternate link", () => {
    const xml = renderAtom({ ...meta, self: "/feed/blog/atom/" }, entries);
    const links = parser.parse(xml).feed.link;
    expect(links.map((link: Record<string, string>) => link["@rel"])).toEqual(["alternate", "self"]);
    expect(links[1]["@href"]).toBe(absolute("/feed/blog/atom/"));
  });
});

describe("escaping", () => {
  test("every XML metacharacter is escaped", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });

  test("a title full of markup cannot break the document", () => {
    const xml = renderRss(meta, [
      {
        id: "3",
        title: "</title><script>alert(1)</script>",
        link: "/problem/x",
        descriptionHtml: "</description>",
        published: 0,
        updated: 0,
      },
    ]);
    expect(XMLValidator.validate(xml)).toBe(true);
    const item = parser.parse(xml).rss.channel.item;
    expect(item.title).toBe("</title><script>alert(1)</script>");
  });
});

describe("dates", () => {
  test("RSS uses RFC 2822 and Atom uses RFC 3339", () => {
    expect(rfc2822(0)).toBe("Thu, 01 Jan 1970 00:00:00 +0000");
    expect(rfc3339(0)).toBe("1970-01-01T00:00:00Z");
  });
});

describe("absolute links", () => {
  test("site-relative paths gain the configured origin", () => {
    expect(absolute("/problems/")).toMatch(/^https?:\/\/.+\/problems\/$/);
    expect(absolute("https://example.com/x")).toBe("https://example.com/x");
  });
});
