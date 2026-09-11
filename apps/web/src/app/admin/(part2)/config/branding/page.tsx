import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { query } from "@/lib/convex-server";
import { Crumbs } from "../../_components/Crumbs";
import { BrandingForm } from "./BrandingForm";

export const metadata = { title: "Branding" };

export default async function AdminBrandingPage() {
  const branding = await query(api.site.branding, {}).catch(() => null);

  return (
    <>
      <TitleRow
        title="Branding"
        breadcrumb={<Crumbs items={[{ label: "Config", href: "/admin/config/" }, { label: "Branding" }]} />}
      />
      <BrandingForm branding={branding} />
    </>
  );
}
