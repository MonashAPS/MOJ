import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
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
    isImpersonating: Boolean(session?.session.impersonatedBy),
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
