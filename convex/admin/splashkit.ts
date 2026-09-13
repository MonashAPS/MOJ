// Staff console: the SplashKit languages.
//
// These are not seeded. A deployment only offers them once its judges run the
// SplashKit image (apps/judge/Dockerfile.splashkit), and a language whose
// executor no judge reports is a language whose submissions sit in the queue. So
// adding them is a deliberate step the operator takes, once, after the judge is
// in place:
//
//     npx convex run admin/splashkit:addLanguages '{}'
//
// Running it again refreshes the rows rather than duplicating them. Removing a
// language is the console's job, through `admin/languages:remove`, which also
// takes it off every problem that allows it.

import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";

/** The catalogue rows, keyed to the executors in the judge image. The keys have
 *  to match the executor module names exactly: that is what the judge reports in
 *  its handshake and what a claim names. */
const LANGUAGES = [
  {
    key: "SKCPP",
    name: "C++ (SplashKit)",
    shortName: "C++ SK",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    template: '#include "splashkit.h"\n\nint main()\n{\n    write_line(read_line());\n    return 0;\n}\n',
    info: "",
    description: "C++ linked against SplashKit. Console input and output only.",
    extension: "cpp",
  },
  {
    key: "SKPY3",
    name: "Python 3 (SplashKit)",
    shortName: "Py SK",
    commonName: "Python",
    editorMode: "python",
    shikiLang: "python",
    template: "import splashkit\n\nsplashkit.write_line(splashkit.read_line())\n",
    info: "",
    description: "Python 3 with the SplashKit module. Console input and output only.",
    extension: "py",
  },
];

export type SplashKitReport = { added: string[]; updated: string[] };

const reportValidator = v.object({ added: v.array(v.string()), updated: v.array(v.string()) });

async function byKey(ctx: MutationCtx, key: string): Promise<Doc<"languages"> | null> {
  return await ctx.db
    .query("languages")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

export const addLanguages = internalMutation({
  args: {},
  returns: reportValidator,
  handler: async (ctx): Promise<SplashKitReport> => {
    const report: SplashKitReport = { added: [], updated: [] };

    for (const language of LANGUAGES) {
      const existing = await byKey(ctx, language.key);
      if (existing) {
        // The key is the identity, as it is for the importer, so a second run
        // refreshes the copy instead of leaving two rows behind.
        await ctx.db.patch(existing._id, language);
        report.updated.push(language.key);
        continue;
      }
      await ctx.db.insert("languages", language);
      report.added.push(language.key);
    }

    return report;
  },
});
