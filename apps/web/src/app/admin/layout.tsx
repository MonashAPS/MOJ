import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.shell");
  return {
    title: { default: t("consoleName"), template: t("titleTemplate") },
    robots: { index: false, follow: false },
  };
}

/** SPEC section 8: the console is staff only, and says so rather than 404ing. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [viewer, t] = await Promise.all([
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    getTranslations("admin.shell"),
  ]);
  const profile = viewer?.profile ?? null;
  const isStaff = !!profile && (profile.isStaff || profile.isSuperuser);

  if (!isStaff) {
    return <ErrorScreen code={403} id="AccessDenied" description={t("accessDenied")} />;
  }

  return <AdminChrome>{children}</AdminChrome>;
}
