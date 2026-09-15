import { api } from "@convex/_generated/api";
import { EmptyState, TitleRow } from "@moj/ui";
import { GraduationCap } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { ClassesBrowser } from "./ClassesBrowser";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.classes");

  return { title: t("title") };
}

export default async function AdminClassesPage() {
  const [t, organizations] = await Promise.all([
    getTranslations("admin.classes"),
    queryAsViewer(api.admin.organizations.list, {}).catch(() => []),
  ]);

  return (
    <>
      <TitleRow title={t("title")} />
      {organizations.length === 0 ? (
        <EmptyState
          icon={<GraduationCap aria-hidden />}
          title={t("noOrganizationsTitle")}
          description={t("noOrganizationsDescription")}
        />
      ) : (
        <ClassesBrowser
          organizations={organizations.map((organization) => ({
            slug: organization.slug,
            name: organization.name,
            classCount: organization.classCount,
          }))}
        />
      )}
    </>
  );
}
