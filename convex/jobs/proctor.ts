/**
 * Ageing proctoring recordings out.
 *
 * A screen recording is the largest thing this site stores and the least often
 * looked at: one contest is tens of gigabytes, and after the results are
 * settled it is a liability rather than an asset. The sweep drops the video and
 * keeps the session, so who shared and when stays on the record while the
 * footage does not.
 */

import { PROCTOR_RETENTION_DAYS } from "@moj/core";
import { internalMutation } from "../_generated/server";

/** How many blobs one run deletes, so a backlog never blocks a transaction. */
const BATCH = 200;

export const sweepRecordings = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    // Fixed rather than configurable: it is what the proctoring terms promise.
    const cutoff = Date.now() - PROCTOR_RETENTION_DAYS * 24 * 60 * 60 * 1000;

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
