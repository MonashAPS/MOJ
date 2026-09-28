import { api } from "@convex/_generated/api";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Crumbs } from "@/components/admin";
import { TitleRow } from "@/components/shell/PageTabs";
import { query } from "@/lib/convex-server";
import { BrandingForm } from "./BrandingForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.branding");

  return { title: t("metaTitle") };
}

export default async function AdminBrandingPage() {
  const t = await getTranslations("admin.branding");
  const branding = await query(api.site.branding, {}).catch(() => null);

  return (
    <>
      <TitleRow
        title={t("title")}
        breadcrumb={
          <Crumbs
            items={[{ label: t("crumbConfig"), href: "/admin/config/" }, { label: t("crumbBranding") }]}
          />
        }
      />
      <BrandingForm branding={branding} />
    </>
  );
}
