import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/auth/db";

export function gravatarUrl(email: string | null | undefined, size = 32): string {
  const normalized = (email ?? "").trim().toLowerCase();
  const hash = createHash("md5").update(normalized).digest("hex");

  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}

/**
 * `gravatar(user, size)` for someone who is not the viewer. A profile carries the
 * Better Auth user id and the address it hashes lives in the auth database, so
 * this is server-only; only the hash ever reaches the page.
 */
async function gravatarUrlsForUserIds(userIds: readonly string[], size = 32): Promise<Map<string, string>> {
  const wanted = [...new Set(userIds.filter(Boolean))];
  const urls = new Map<string, string>();

  if (wanted.length === 0) return urls;

  try {
    const rows = await db
      .select({ id: schema.user.id, email: schema.user.email })
      .from(schema.user)
      .where(inArray(schema.user.id, wanted));

    for (const row of rows) urls.set(row.id, gravatarUrl(row.email, size));
  } catch {
    // A page that is otherwise readable should not fail on the avatar; the
    // default identicon below stands in.
  }

  for (const id of wanted) {
    if (!urls.has(id)) urls.set(id, gravatarUrl(null, size));
  }

  return urls;
}

export async function gravatarUrlForUserId(userId: string, size = 32): Promise<string> {
  return (await gravatarUrlsForUserIds([userId], size)).get(userId) ?? gravatarUrl(null, size);
}
