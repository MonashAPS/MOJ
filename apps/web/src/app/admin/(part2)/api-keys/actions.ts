"use server";

import { createHash } from "node:crypto";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { auth } from "@/auth/server";
import { mutateAsViewer, queryAsViewer } from "@/lib/convex-server";
import { type ActionResult, authHeaders, failed, requireConsoleViewer } from "../_lib/guard";
import type { ConsoleKeyRow } from "./scopes";

/** Better Auth models a scope as `{resource: [action]}`; the wire form is
 *  `resource:action`, which is what the problems API reads. */
function toPermissions(scopes: string[]): Record<string, string[]> {
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

function fromPermissions(permissions: unknown): string[] {
  if (!permissions || typeof permissions !== "object") return [];
  const out: string[] = [];
  for (const [resource, actions] of Object.entries(permissions as Record<string, string[]>)) {
    for (const action of actions ?? []) out.push(`${resource}:${action}`);
  }
  return out;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function millis(value: unknown): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export async function listKeysAction(): Promise<ActionResult<ConsoleKeyRow[]>> {
  try {
    await requireConsoleViewer();
    const listed = await auth.api.listApiKeys({ headers: await authHeaders() });
    const keys = Array.isArray(listed) ? listed : ((listed as { apiKeys?: unknown[] }).apiKeys ?? []);
    const mirrored = await queryAsViewer(api.pages.admin2.myApiKeys, {});
    const byPrefix = new Map(mirrored.map((row) => [row.prefix ?? "", row]));

    const rows: ConsoleKeyRow[] = (keys as Record<string, unknown>[]).map((key) => {
      const start = (key.start as string | null) ?? null;
      const match = start ? byPrefix.get(start) : undefined;
      return {
        id: String(key.id),
        name: (key.name as string | null) ?? "Unnamed key",
        start,
        scopes: fromPermissions(key.permissions),
        enabled: key.enabled !== false,
        createdAt: millis(key.createdAt) ?? Date.now(),
        expiresAt: millis(key.expiresAt),
        lastUsedAt: match?.lastUsedAt ?? millis(key.lastRequest),
        mirrored: Boolean(match),
        convexId: match ? (match._id as string) : null,
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
 * against that table whenever it cannot reach the web app (SPEC_CHANGES,
 * 2026-09-10). The key itself is shown once and never stored in the clear.
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
    const name = input.name.trim();
    if (name.length === 0) return { ok: false, error: "A key needs a name." };
    if (input.scopes.length === 0) return { ok: false, error: "Choose at least one scope." };

    const expiresIn = input.expiresInDays ? input.expiresInDays * 24 * 60 * 60 : undefined;
    const created = await auth.api.createApiKey({
      body: {
        name,
        userId: viewer.userId,
        permissions: toPermissions(input.scopes),
        ...(expiresIn ? { expiresIn } : {}),
      },
    });

    const start = created.start ?? created.key.slice(0, 6);
    const expiresAt = millis(created.expiresAt);

    let mirrored = true;
    let warning: string | undefined;
    try {
      await mutateAsViewer(api.pages.admin2.recordApiKey, {
        keyHash: sha256Hex(created.key),
        prefix: start,
        name,
        scopes: input.scopes,
        expiresAt,
      });
    } catch (error) {
      mirrored = false;
      warning = `The key works against this site, but it could not be mirrored into the judge's key table: ${
        error instanceof Error ? error.message : String(error)
      }`;
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
  convexId: string | null,
): Promise<ActionResult<undefined>> {
  try {
    await requireConsoleViewer();
    await auth.api.deleteApiKey({ body: { keyId }, headers: await authHeaders() });
    if (convexId) {
      await mutateAsViewer(api.pages.admin2.revokeApiKey, {
        id: convexId as Id<"apiKeys">,
      }).catch(() => undefined);
    }
    return { ok: true, data: undefined };
  } catch (error) {
    return failed(error);
  }
}
