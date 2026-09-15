/**
 * The option lists the scoreboard event form picks from.
 */

import { query } from "../../_generated/server";
import { staffViewer } from "./console";

export const options = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await staffViewer(ctx);

    if (!viewer) return { contests: [], organizations: [] };

    const contests = (await ctx.db.query("contests").collect())
      .sort((a, b) => b.startTime - a.startTime)
      .map((row) => ({ key: row.key, name: row.name, startTime: row.startTime }));

    const organizations = (await ctx.db.query("organizations").collect())
      .map((row) => ({ slug: row.slug, name: row.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { contests, organizations };
  },
});
