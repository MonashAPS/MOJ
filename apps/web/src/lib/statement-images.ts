import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolveMediaPath } from "./media";

/**
 * The images a problem statement draws, gathered for a Typst compile.
 *
 * Typst reads only files under its compile root and has no network, so every
 * image has to be copied or downloaded into the workdir first. A statement may
 * point at the imported DMOJ media tree, at an image uploaded through the
 * problems API, or at some other site entirely.
 */

/** Past this an image is left out rather than fetched. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** One slow host must not hold the whole PDF up. */
const FETCH_TIMEOUT_MS = 5_000;

/** A statement that names more images than this keeps only the first ones. */
const MAX_IMAGES = 40;

const IMAGE_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp)$/i;

/** Where a statement image's bytes come from. */
export type ImageOrigin =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "url"; readonly url: string };

/**
 * The image's path under the compile root, named after its source so the same
 * statement always compiles to the same Typst and the PDF cache stays valid.
 * The extension is kept when the source has one; Typst sniffs the rest.
 */
export function statementImagePath(src: string): string {
  const pathname = src.split(/[?#]/, 1)[0] ?? src;
  const extension = IMAGE_EXTENSION.exec(pathname)?.[0].toLowerCase() ?? "";

  return `images/${createHash("sha256").update(src).digest("hex").slice(0, 16)}${extension}`;
}

/** Where an image is read from, or null for a source nothing can be read from. */
export function statementImageOrigin(
  src: string,
  { mediaRoot, siteUrl }: { mediaRoot: string; siteUrl: string },
): ImageOrigin | null {
  if (src.startsWith("/media/")) {
    let segments: string[];

    try {
      segments = (src.split(/[?#]/, 1)[0] ?? "").slice("/media/".length).split("/").map(decodeURIComponent);
    } catch {
      return null;
    }

    const path = resolveMediaPath(mediaRoot, segments);

    return path ? { kind: "file", path } : null;
  }

  if (src.startsWith("/") && !src.startsWith("//")) return { kind: "url", url: new URL(src, siteUrl).href };

  if (/^https?:\/\//i.test(src)) return { kind: "url", url: src };

  return null;
}

/** The images to compile with, capped, each with where to read it. */
export function statementImages(
  sources: Iterable<string>,
  places: { mediaRoot: string; siteUrl: string },
): Map<string, ImageOrigin> {
  const images = new Map<string, ImageOrigin>();

  for (const src of sources) {
    if (images.size >= MAX_IMAGES) break;
    const origin = statementImageOrigin(src, places);

    if (origin) images.set(src, origin);
  }

  return images;
}

async function readOrigin(origin: ImageOrigin, fetcher: typeof fetch): Promise<Uint8Array | null> {
  if (origin.kind === "file") {
    try {
      const bytes = await readFile(origin.path);

      return bytes.byteLength <= MAX_IMAGE_BYTES ? new Uint8Array(bytes) : null;
    } catch {
      return null;
    }
  }

  try {
    const response = await fetcher(origin.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    if (!response.ok) return null;

    if ((response.headers.get("content-type") ?? "").startsWith("text/html")) return null;

    const declared = Number(response.headers.get("content-length") ?? "0");

    if (declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());

    return bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Reads every image into compile assets. An image that cannot be read is left
 * out of the PDF rather than failing it, and is reported so the caller can
 * avoid caching a PDF that is missing it.
 */
export async function loadStatementImages(
  images: ReadonlyMap<string, ImageOrigin>,
  fetcher: typeof fetch = fetch,
): Promise<{ assets: Record<string, Uint8Array>; missing: Set<string> }> {
  const assets: Record<string, Uint8Array> = {};
  const missing = new Set<string>();

  await Promise.all(
    [...images].map(async ([src, origin]) => {
      const bytes = await readOrigin(origin, fetcher);

      if (bytes) assets[statementImagePath(src)] = bytes;
      else missing.add(src);
    }),
  );

  return { assets, missing };
}
