import type { ImportContext } from "../context.ts";

export interface Step {
  /** Convex table this step fills. */
  table: string;
  /** MySQL tables it reads, for the report. */
  sources: string[];
  run(ctx: ImportContext): Promise<void>;
}

/** Tables other steps resolve foreign keys against. */
export const MAP_TARGETS = new Set([
  "languages",
  "problemTypes",
  "problemGroups",
  "licenses",
  "profiles",
  "organizations",
  "classes",
  "problems",
  "solutions",
  "judges",
  "contestTags",
  "contests",
  "contestProblems",
  "contestParticipations",
  "submissions",
  "blogPosts",
  "comments",
  "tickets",
  "navigationBar",
]);
