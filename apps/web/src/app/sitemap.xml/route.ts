// judge/sitemap.py, as one urlset. Next's own `sitemap.ts` convention caps
// entries and rewrites URLs, so the XML is built here instead.

import { api } from "@convex/_generated/api";
import { absolute, escapeXml, xmlResponse } from "@/app/feed/xml";
import { query } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const entries = await query(api.feeds.sitemap, {}).catch(() => []);

  const urls = entries
    .map((entry) => {
      const lastmod =
        entry.lastmod === undefined
          ? ""
          : `\n    <lastmod>${new Date(entry.lastmod).toISOString().slice(0, 10)}</lastmod>`;
      return `  <url>
    <loc>${escapeXml(absolute(entry.location))}</loc>${lastmod}
    <changefreq>${escapeXml(entry.changefreq)}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return xmlResponse(body, "application/xml; charset=utf-8");
}
