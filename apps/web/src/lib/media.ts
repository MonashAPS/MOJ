import { access, constants } from "node:fs/promises";
import path from "node:path";

/**
 * DMOJ served user uploaded statement images from `MEDIA_URL`, which on the
 * MAPS judge was `/media/`, and the imported statements still carry those
 * paths (`/media/martor/<uuid>.png`). The rsynced media tree lands in
 * `infra/media/`, so MOJ keeps the same URL space and reads from there.
 */
const MEDIA_DIRNAME = path.join("infra", "media");

const EXTENSION_TYPES = new Map<string, string>([
  [".apng", "image/apng"],
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function mediaContentType(filePath: string): string {
  return EXTENSION_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

let cachedRoot: string | null = null;

/**
 * `MOJ_MEDIA_ROOT` wins; otherwise walk up from the working directory looking
 * for `infra/media`. Dev runs the app with the working directory at
 * `apps/web`, a container runs it at the repository root, so neither can be
 * assumed.
 */
export async function mediaRoot(): Promise<string> {
  if (cachedRoot) return cachedRoot;

  const configured = process.env.MOJ_MEDIA_ROOT;

  if (configured) {
    cachedRoot = path.resolve(configured);

    return cachedRoot;
  }

  let dir = process.cwd();

  for (;;) {
    const candidate = path.join(dir, MEDIA_DIRNAME);

    try {
      await access(candidate, constants.R_OK);
      cachedRoot = candidate;

      return cachedRoot;
    } catch {
      // keep walking
    }

    const parent = path.dirname(dir);

    if (parent === dir) break;
    dir = parent;
  }

  // Nothing on disk yet (the tree is gitignored and only exists after an
  // import). Resolve against the working directory so the route 404s cleanly.
  cachedRoot = path.join(process.cwd(), MEDIA_DIRNAME);

  return cachedRoot;
}

/**
 * The absolute path a `/media/...` URL names, or null when the segments escape
 * the media root or name nothing servable.
 */
export function resolveMediaPath(root: string, segments: readonly string[]): string | null {
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;

    if (segment.includes("\0") || segment.includes("/") || segment.includes("\\")) return null;
  }

  const resolved = path.resolve(root, ...segments);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;

  if (!resolved.startsWith(prefix)) return null;

  return resolved;
}

/** Content-addressed upload names never change, so they cache forever. */
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
