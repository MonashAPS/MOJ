/**
 * Ageing proctoring recordings out.
 *
 * A screen recording is the largest thing this site stores and the least often
 * looked at: one contest is tens of gigabytes, and after the results are
 * settled it is a liability rather than an asset. The sweep drops the video and
 * keeps the session, so who shared and when stays on the record while the
 * footage does not.
 */

import { internalMutation } from "../_generated/server";
import { siteSettings } from "../lib/community";

/** Default when nobody has chosen. Long enough to settle a dispute. */
const DEFAULT_RETENTION_DAYS = 30;

/** How many blobs one run deletes, so a backlog never blocks a transaction. */
const BATCH = 200;

export const sweepRecordings = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    const settings = await siteSettings(ctx);
    const days = settings?.proctorRetentionDays ?? DEFAULT_RETENTION_DAYS;
    // Zero is "keep for ever", which an operator has to choose deliberately.
    if (days <= 0) return { deleted: 0 };

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const stale = await ctx.db
      .query("proctorChunks")
      .filter((q) => q.lt(q.field("startedAt"), cutoff))
      .take(BATCH);

    for (const chunk of stale) {
      await ctx.storage.delete(chunk.storageId);
      await ctx.db.delete(chunk._id);
    }
    return { deleted: stale.length };
  },
});
