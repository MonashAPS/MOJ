import { loadFeed } from "@/app/feed/items";
import { RSS_CONTENT_TYPE, renderRss, xmlResponse } from "@/app/feed/xml";

export const dynamic = "force-dynamic";

export async function GET() {
  const { meta, entries } = await loadFeed("comment", "rss");
  return xmlResponse(renderRss(meta, entries), RSS_CONTENT_TYPE);
}
