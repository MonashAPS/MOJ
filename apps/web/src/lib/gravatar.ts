import { createHash } from "node:crypto";

export function gravatarUrl(email: string | null | undefined, size = 32): string {
  const normalized = (email ?? "").trim().toLowerCase();
  const hash = createHash("md5").update(normalized).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}
