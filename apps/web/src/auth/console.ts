import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { queryAsViewer } from "@/lib/convex-server";

export type ConsoleViewer = {
  userId: string;
  username: string;
  profile: Doc<"profiles">;
  isSuperuser: boolean;
  permissions: string[];
  isImpersonating: boolean;
};

/** The console's own gate. Convex re-checks every call; this only decides what
 *  the page is allowed to render and which server actions may run. */
export async function consoleViewer(): Promise<ConsoleViewer | null> {
  const [state, session] = await Promise.all([
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getServerSession().catch(() => null),
  ]);
  const profile = state?.profile ?? null;
  if (!profile || !(profile.isStaff || profile.isSuperuser)) return null;
  return {
    userId: profile.userId,
    username: profile.username,
    profile,
    isSuperuser: profile.isSuperuser,
    permissions: profile.permissions,
    isImpersonating: Boolean(
      (session?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy,
    ),
  };
}

export async function requireConsoleViewer(): Promise<ConsoleViewer> {
  const viewer = await consoleViewer();
  if (!viewer) {
    const t = await getTranslations("admin.shell.errors");
    throw new Error(t("accessDenied"));
  }
  return viewer;
}

export async function requireSuperuser(): Promise<ConsoleViewer> {
  const viewer = await requireConsoleViewer();
  if (!viewer.isSuperuser) {
    const t = await getTranslations("admin.shell.errors");
    throw new Error(t("superuserOnly"));
  }
  return viewer;
}

export function can(viewer: ConsoleViewer, code: string): boolean {
  return viewer.isSuperuser || viewer.permissions.includes(code);
}

export async function requirePermission(code: string): Promise<ConsoleViewer> {
  const viewer = await requireConsoleViewer();
  if (!can(viewer, code)) {
    const t = await getTranslations("admin.shell.errors");
    throw new Error(t("missingPermission", { code }));
  }
  return viewer;
}

/**
 * Better Auth's server API answers with `Set-Cookie` headers; a server action
 * has to hand them to Next's cookie store itself, because the response the
 * browser sees is Next's, not Better Auth's.
 */
export async function applySetCookies(responseHeaders: Headers): Promise<void> {
  const store = await cookies();
  for (const raw of responseHeaders.getSetCookie()) {
    const [pair = "", ...attributes] = raw.split(";");
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = decodeURIComponent(pair.slice(index + 1).trim());

    const options: {
      path?: string;
      maxAge?: number;
      expires?: Date;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      domain?: string;
    } = {};
    for (const attribute of attributes) {
      const [key = "", attributeValue = ""] = attribute.split("=").map((part) => part.trim());
      switch (key.toLowerCase()) {
        case "path":
          options.path = attributeValue;
          break;
        case "max-age":
          options.maxAge = Number(attributeValue);
          break;
        case "expires":
          options.expires = new Date(attributeValue);
          break;
        case "httponly":
          options.httpOnly = true;
          break;
        case "secure":
          options.secure = true;
          break;
        case "domain":
          options.domain = attributeValue;
          break;
        case "samesite":
          options.sameSite = attributeValue.toLowerCase() as "lax" | "strict" | "none";
          break;
      }
    }
    store.set(name, value, options);
  }
}

export async function authHeaders(): Promise<Headers> {
  return new Headers(await headers());
}

/** Server actions report failure as a value; nothing here throws at the client. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function failed(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message.replace(/^\[.*?\]\s*/, "") };
}
