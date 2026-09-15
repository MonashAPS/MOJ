import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { MEDIA_CACHE_CONTROL, mediaContentType, mediaRoot, resolveMediaPath } from "@/lib/media";

/**
 * `/media/...`, DMOJ's `MEDIA_URL`. Imported statements reference uploads by
 * their old absolute paths, so MOJ serves the rsynced `infra/media/` tree at
 * the same URLs rather than rewriting every statement.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const root = await mediaRoot();
  const filePath = resolveMediaPath(root, segments ?? []);

  if (!filePath) return new Response("Not found", { status: 404 });

  let info: Awaited<ReturnType<typeof stat>>;

  try {
    info = await stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!info.isFile()) return new Response("Not found", { status: 404 });

  // SAFETY: `Readable.toWeb` hands back the same stream object `Response` reads,
  // under `node:stream/web`'s declaration of it rather than the DOM's.
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": mediaContentType(filePath),
      "Content-Length": String(info.size),
      "Cache-Control": MEDIA_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
