import { loadFeed } from "@/app/feed/items";
import { ATOM_CONTENT_TYPE, renderAtom, xmlResponse } from "@/app/feed/xml";

export const dynamic = "force-dynamic";

export async function GET() {
  const { meta, entries } = await loadFeed("blog", "atom");
  return xmlResponse(renderAtom(meta, entries), ATOM_CONTENT_TYPE);
}
