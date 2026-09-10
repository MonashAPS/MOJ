"use server";

import { headers } from "next/headers";
import { auth } from "@/auth/server";

export type TokenScope = "read" | "problems:write";

export type ApiKeySummary = {
  id: string;
  name: string;
  start: string | null;
  createdAt: number;
  lastRequest: number | null;
  scopes: TokenScope[];
};

export type GenerateResult = { ok: true; token: string } | { ok: false; message: string };

/** Better Auth models scopes as `{resource: [action]}`; the wire names in
 *  docs/using/accounts.md are `read` and `problems:write`. */
function permissionsFor(scopes: TokenScope[]): Record<string, string[]> {
  const permissions: Record<string, string[]> = {};
  for (const scope of scopes) {
    const [resource, action] = scope.includes(":") ? scope.split(":") : ["api", scope];
    if (!resource || !action) continue;
    permissions[resource] = [...(permissions[resource] ?? []), action];
  }
  return permissions;
}

function scopesFrom(raw: unknown): TokenScope[] {
  let parsed: Record<string, string[]> = {};
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Record<string, string[]>;
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === "object") {
    parsed = raw as Record<string, string[]>;
  }
  const scopes: TokenScope[] = [];
  for (const [resource, actions] of Object.entries(parsed)) {
    for (const action of actions ?? []) {
      scopes.push((resource === "api" ? action : `${resource}:${action}`) as TokenScope);
    }
  }
  return scopes;
}

export async function listApiTokens(): Promise<ApiKeySummary[]> {
  const requestHeaders = await headers();
  const result = await auth.api.listApiKeys({ headers: requestHeaders }).catch(() => []);
  // The endpoint answers with `{apiKeys}`; older shapes answered with the array.
  const keys = Array.isArray(result) ? result : ((result as { apiKeys?: unknown[] }).apiKeys ?? []);
  return (keys as Array<Record<string, unknown>>).map((key, index) => ({
    id: String(key.id),
    name: typeof key.name === "string" && key.name ? key.name : `Token ${index + 1}`,
    start: typeof key.start === "string" ? key.start : null,
    createdAt: key.createdAt ? new Date(key.createdAt as string).getTime() : Date.now(),
    lastRequest: key.lastRequest ? new Date(key.lastRequest as string).getTime() : null,
    scopes: scopesFrom(key.permissions),
  }));
}

/** DMOJ's `generate_api_token`: the token is shown once and only its hash is
 *  kept, so a lost token is replaced rather than recovered. */
export async function generateApiToken(input: {
  name: string;
  scopes: TokenScope[];
}): Promise<GenerateResult> {
  const requestHeaders = await headers();
  try {
    const created = await auth.api.createApiKey({
      headers: requestHeaders,
      body: {
        name: input.name.trim() || "API token",
        prefix: "moj",
        permissions: permissionsFor(input.scopes.length > 0 ? input.scopes : ["read"]),
      },
    });
    return { ok: true, token: (created as { key: string }).key };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    return {
      ok: false,
      message: status === 401 ? "Log in again to generate a token." : "That token could not be created.",
    };
  }
}
