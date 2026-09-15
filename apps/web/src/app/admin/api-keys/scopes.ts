import type { Id } from "@convex/_generated/dataModel";
import { PROBLEMS_WRITE_SCOPE, READ_SCOPE } from "@moj/protocol";

/** The two scopes a key can hold, the same pair `/accounts/api/token/generate/`
 *  offers. `problems:write` is the one a problem repository's CI needs (SPEC
 *  sections 8 and 22). */
export const API_KEY_SCOPES = [
  { value: READ_SCOPE, label: READ_SCOPE, hintKey: "scopeRead" },
  { value: PROBLEMS_WRITE_SCOPE, label: PROBLEMS_WRITE_SCOPE, hintKey: "scopeProblemsWrite" },
] as const;

export type ConsoleKeyRow = {
  id: string;
  name: string;
  start: string | null;
  scopes: string[];
  enabled: boolean;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  mirrored: boolean;
  convexId: Id<"apiKeys"> | null;
};
