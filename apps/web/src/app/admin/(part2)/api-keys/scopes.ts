/** The wire scopes the console offers. `problems:write` is the one a problem
 *  repo's GitHub Action needs (SPEC sections 8 and 22). */
export const API_KEY_SCOPES = [
  {
    value: "problems:write",
    label: "problems:write",
    hint: "Create and update problems, upload statement images",
  },
  { value: "problems:read", label: "problems:read", hint: "Read problem statements and metadata" },
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
