import { api } from "@convex/_generated/api";
import { Button } from "@moj/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { TitleRow } from "@/components/shell/PageTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { ConfigTabs } from "./ConfigTabs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.config");

  return { title: t("metaTitle") };
}

export default async function AdminConfigPage() {
  const t = await getTranslations("admin.config");

  const [settings, languages] = await Promise.all([
    queryAsViewer(api.site.settings, {}).catch(() => null),
    queryAsViewer(api.languages.list, {}).catch(() => []),
  ]);

  return (
    <>
      <TitleRow
        title={t("title")}
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/config/branding/">{t("brandingAction")}</Link>
          </Button>
        }
      />
      <ConfigTabs
        settings={settings}
        languages={languages.map((language) => ({ key: language.key, name: language.name }))}
      />
    </>
  );
}
