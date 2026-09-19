import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";

/**
 * A file attached to a contest or a problem, streamed through Next so the
 * storage URL never reaches the browser: what the viewer may not download is
 * a file that is not there, as a private problem is a problem that is not.
 */
export async function artefactResponse(id: string): Promise<Response> {
  // SAFETY: the id came off the URL; the query rejects one that is not an artefact id.
  const file = await queryAsViewer(api.artefacts.download, { id: id as Id<"artefacts"> }).catch(() => null);

  if (!file) {
    const t = await getTranslations("common.states");

    return new Response(t("notFound"), {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const upstream = await fetch(file.url);

  if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.size),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
