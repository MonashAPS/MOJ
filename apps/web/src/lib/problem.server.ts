import { api } from "@convex/_generated/api";
import { cache } from "react";
import { queryAsViewer } from "@/lib/convex-server";
import { viewerLanguage } from "@/lib/language.server";

/** Share the viewer's problem read across metadata, content and contest checks in one render. */
export const loadProblem = cache(async (code: string) =>
  queryAsViewer(api.problems.get, { code, language: await viewerLanguage() }),
);
