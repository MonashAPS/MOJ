import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { consoleViewer } from "@/auth/console";
import { AdminChrome } from "@/components/admin";
import { ErrorScreen } from "@/components/shell/ErrorScreen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.shell");

  return {
    title: { default: t("consoleName"), template: t("titleTemplate") },
    robots: { index: false, follow: false },
  };
}

/** SPEC section 8: the console is staff only, and says so rather than 404ing. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [viewer, t] = await Promise.all([consoleViewer(), getTranslations("admin.shell")]);

  if (!viewer) {
    return <ErrorScreen code={403} id="AccessDenied" description={t("accessDenied")} />;
  }

  return <AdminChrome>{children}</AdminChrome>;
}
