"use server";

import { createHash } from "node:crypto";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getTranslations } from "next-intl/server";
import { requireConsoleViewer } from "@/auth/console";
import { auth } from "@/auth/server";
import { type ActionResult, authHeaders, failed } from "@/lib/actions";
import { mutateAsViewer, queryAsViewer } from "@/lib/convex-server";
import type { ConsoleKeyRow } from "./scopes";

/** Better Auth models a scope as `{resource: [action]}`; the wire form is
 *  `resource:action`, which is what the problems API reads. */
function toPermissions(scopes: string[]) {
  const out: Record<string, string[]> = {};

  for (const scope of scopes) {
    const [resource, action] = scope.split(":");

    if (!resource || !action) continue;
    const bucket = out[resource];

    if (bucket) bucket.push(action);
    else out[resource] = [action];
  }

  return out;
}

/** The api-key plugin parses the stored permissions before it answers, so the
 *  wire form is rebuilt from that object. */
function fromPermissions(permissions: Record<string, string[]> | null | undefined): string[] {
  const out: string[] = [];

  for (const [resource, actions] of Object.entries(permissions ?? {})) {
    for (const action of actions ?? []) out.push(`${resource}:${action}`);
  }

  return out;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function millis(value: Date | null | undefined): number | null {
  if (!value) return null;
  const time = value.getTime();

  return Number.isNaN(time) ? null : time;
}

export async function listKeysAction(): Promise<ActionResult<ConsoleKeyRow[]>> {
  try {
    await requireConsoleViewer();
    const t = await getTranslations("admin.apiKeys");
    const listed = await auth.api.listApiKeys({ headers: await authHeaders() });
    const mirrored = await queryAsViewer(api.pages.admin.apiKeys.mine, {});
    const byPrefix = new Map(mirrored.map((row) => [row.prefix ?? "", row]));

    const rows: ConsoleKeyRow[] = listed.apiKeys.map((key) => {
      const start = key.start;
      const match = start ? byPrefix.get(start) : undefined;

      return {
        id: key.id,
        name: key.name ?? t("unnamedKey"),
        start,
        scopes: fromPermissions(key.permissions),
        enabled: key.enabled !== false,
        createdAt: millis(key.createdAt) ?? Date.now(),
        expiresAt: millis(key.expiresAt),
        lastUsedAt: match?.lastUsedAt ?? millis(key.lastRequest),
        mirrored: Boolean(match),
        convexId: match?._id ?? null,
      };
    });

    rows.sort((a, b) => b.createdAt - a.createdAt);

    return { ok: true, data: rows };
  } catch (error) {
    return failed(error);
  }
}

/**
 * Mints the key with Better Auth's api-key plugin and mirrors its sha256 into
 * the `apiKeys` Convex table, because the problems API verifies a presented key
 * against that table whenever it cannot reach the web app. The key itself is shown once and never stored
 * in the clear.
 *
 * `permissions` is a server-only property, so the call must not carry request
 * headers; the acting user is passed explicitly instead, after this module's
 * own gate has checked the session.
 */
export async function createKeyAction(input: {
  name: string;
  scopes: string[];
  expiresInDays: number | null;
}): Promise<ActionResult<{ key: string; row: ConsoleKeyRow; warning?: string }>> {
  try {
    const viewer = await requireConsoleViewer();
    const t = await getTranslations("admin.apiKeys");
    const name = input.name.trim();

    if (name.length === 0) return { ok: false, error: t("nameRequired") };

    if (input.scopes.length === 0) return { ok: false, error: t("scopeRequired") };

    const body = {
      name,
      userId: viewer.userId,
      permissions: toPermissions(input.scopes),
    };

    const expiresIn = input.expiresInDays ? input.expiresInDays * 24 * 60 * 60 : null;
    const created = await auth.api.createApiKey({ body: expiresIn ? { ...body, expiresIn } : body });

    const start = created.start ?? created.key.slice(0, 6);
    const expiresAt = millis(created.expiresAt);

    let mirrored = true;
    let warning: string | undefined;

    try {
      await mutateAsViewer(api.pages.admin.apiKeys.record, {
        keyHash: sha256Hex(created.key),
        prefix: start,
        name,
        scopes: input.scopes,
        expiresAt,
      });
    } catch (error) {
      mirrored = false;
      warning = t("mirrorWarning", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ok: true,
      data: {
        key: created.key,
        warning,
        row: {
          id: created.id,
          name,
          start,
          scopes: input.scopes,
          enabled: true,
          createdAt: millis(created.createdAt) ?? Date.now(),
          expiresAt,
          lastUsedAt: null,
          mirrored,
          convexId: null,
        },
      },
    };
  } catch (error) {
    return failed(error);
  }
}

export async function revokeKeyAction(
  keyId: string,
  convexId: Id<"apiKeys"> | null,
): Promise<ActionResult<undefined>> {
  try {
    await requireConsoleViewer();
    await auth.api.deleteApiKey({ body: { keyId }, headers: await authHeaders() });

    if (convexId) {
      await mutateAsViewer(api.pages.admin.apiKeys.revoke, { id: convexId }).catch(() => undefined);
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}
