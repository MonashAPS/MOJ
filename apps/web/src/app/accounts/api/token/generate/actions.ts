"use server";

import { type ApiScope, isApiScope } from "@moj/protocol";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth/server";
import { authErrorStatus } from "@/lib/auth-error";

export type TokenScope = ApiScope;

export type ApiKeySummary = {
  id: string;
  name: string;
  start: string | null;
  createdAt: number;
  lastRequest: number | null;
  scopes: TokenScope[];
};

export type GenerateResult = { ok: true; token: string } | { ok: false; message: string };

/** Better Auth models scopes as `{resource: [action]}`; the two wire names are
 *  `read` and `problems:write` (docs/using/accounts.md). */
function permissionsFor(scopes: TokenScope[]) {
  const permissions: Record<string, string[]> = {};

  for (const scope of scopes) {
    const [resource, action] = scope.includes(":") ? scope.split(":") : ["api", scope];

    if (!resource || !action) continue;
    permissions[resource] = [...(permissions[resource] ?? []), action];
  }

  return permissions;
}

/** The api-key plugin parses the stored permissions before it answers, so the
 *  wire names are rebuilt from that object and kept only where they name a scope
 *  this site still offers. */
function scopesFrom(permissions: Record<string, string[]> | null | undefined): TokenScope[] {
  const scopes: TokenScope[] = [];

  for (const [resource, actions] of Object.entries(permissions ?? {})) {
    for (const action of actions ?? []) {
      const scope = resource === "api" ? action : `${resource}:${action}`;

      if (isApiScope(scope)) scopes.push(scope);
    }
  }

  return scopes;
}

export async function listApiTokens(): Promise<ApiKeySummary[]> {
  const requestHeaders = await headers();
  const t = await getTranslations("auth.apiToken");
  const listed = await auth.api.listApiKeys({ headers: requestHeaders }).catch(() => null);

  return (listed?.apiKeys ?? []).map((key, index) => ({
    id: key.id,
    name: key.name || t("unnamed", { number: index + 1 }),
    start: key.start,
    createdAt: key.createdAt.getTime(),
    lastRequest: key.lastRequest?.getTime() ?? null,
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
  const t = await getTranslations("auth.apiToken");

  try {
    const created = await auth.api.createApiKey({
      headers: requestHeaders,
      body: {
        name: input.name.trim() || "API token",
        prefix: "moj",
        permissions: permissionsFor(input.scopes.length > 0 ? input.scopes : ["read"]),
      },
    });

    return { ok: true, token: created.key };
  } catch (error) {
    return {
      ok: false,
      message: authErrorStatus(error) === 401 ? t("reauth") : t("createFailed"),
    };
  }
}
