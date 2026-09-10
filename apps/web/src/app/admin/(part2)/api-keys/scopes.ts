import { PROBLEMS_WRITE_SCOPE, READ_SCOPE } from "@moj/protocol";

/** The two scopes a key can hold, the same pair `/accounts/api/token/generate/`
 *  offers. `problems:write` is the one a problem repository's CI needs (SPEC
 *  sections 8 and 22). */
export const API_KEY_SCOPES = [
  {
    value: READ_SCOPE,
    label: READ_SCOPE,
    hint: "Read the API v2 endpoints, limited to what the owner can already see",
  },
  {
    value: PROBLEMS_WRITE_SCOPE,
    label: PROBLEMS_WRITE_SCOPE,
    hint: "Create and update problems, and upload statement images",
  },
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
  convexId: string | null;
};
