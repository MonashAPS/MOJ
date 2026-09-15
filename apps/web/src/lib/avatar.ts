/**
 * DMOJ draws every commenter's gravatar. MOJ keeps profiles in Convex and the
 * email addresses in Better Auth, so a member's own avatar comes from their email
 * (`gravatarUrl`) and everybody else gets a gravatar identicon keyed on the
 * username: deterministic, drawn by the same service, and `f=y` so it can never
 * resolve to a stranger's real photograph.
 *
 * Gravatar builds the identicon out of the hex string in the path, so any stable
 * 32-character hash does — no md5, and therefore no `node:crypto`, which keeps
 * this usable from a client component.
 */
export function identiconUrl(seed: string, size = 40): string {
  return `https://www.gravatar.com/avatar/${hashHex(seed.trim().toLowerCase())}?d=identicon&f=y&s=${size}`;
}

/** Four FNV-1a passes over the seed, one per 8 hex digits. */
function hashHex(seed: string): string {
  let out = "";

  for (let round = 0; round < 4; round++) {
    let hash = 0x811c9dc5 ^ round;

    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    out += hash.toString(16).padStart(8, "0");
  }

  return out;
}

/** The one or two letters an avatar falls back to while the image loads. */
export function initials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}]+/gu, " ").trim();

  if (cleaned.length === 0) return "?";
  const parts = cleaned.split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts[parts.length - 1] ?? "";

  if (parts.length === 1) return first.slice(0, 2).toUpperCase();

  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}
