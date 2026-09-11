/**
 * Site-owned test data: the reads and the pure helpers shared by everything
 * that touches the `problemTestData` table.
 *
 * One row per problem holds the published zip archive. The problems API writes
 * it, `GET /judge/data` serves it, `judging.claimNext` names its hash on the
 * claim, and the test data editor shows its state.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type PublishedTestData = {
  hash: string;
  size: number;
  fileCount: number;
  uploadedAt: number;
  uploadedByUsername: string | null;
};

export async function testDataRow(
  ctx: QueryCtx,
  problemId: Id<"problems">,
): Promise<Doc<"problemTestData"> | null> {
  return await ctx.db
    .query("problemTestData")
    .withIndex("by_problem", (q) => q.eq("problemId", problemId))
    .unique();
}

/** What the editor and the problems API report about the published archive. */
export async function publishedTestData(
  ctx: QueryCtx,
  problemId: Id<"problems">,
): Promise<PublishedTestData | null> {
  const row = await testDataRow(ctx, problemId);
  if (!row) return null;
  const uploader = row.uploadedByProfileId ? await ctx.db.get(row.uploadedByProfileId) : null;
  return {
    hash: row.hash,
    size: row.size,
    fileCount: row.fileCount,
    uploadedAt: row.uploadedAt,
    uploadedByUsername: uploader?.username ?? null,
  };
}

/**
 * The first member whose path escapes the extraction root, or null when every
 * name is safe. The judge refuses such an archive too; catching it here means a
 * bad upload fails loudly at publish time rather than on the first submission.
 */
export function unsafeArchiveMember(names: readonly string[]): string | null {
  for (const name of names) {
    const normalized = name.replaceAll("\\", "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return name;
    if (normalized.split("/").some((piece) => piece === "..")) return name;
  }
  return null;
}

/** sha256 of raw bytes, lowercase hex, the form `problemTestData.hash` holds. */
export async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
