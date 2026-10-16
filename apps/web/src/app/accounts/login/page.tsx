import { api } from "@convex/_generated/api";
import { getTranslations } from "next-intl/server";
import { query } from "@/lib/convex-server";
import { LoginForm } from "./LoginForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.login");

  return { title: t("metaTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const branding = await query(api.site.branding, {}).catch(() => null);

  return (
    <LoginForm
      next={params.next ?? "/"}
      initialError={params.error}
      siteName={branding?.siteLongName ?? "MAPS Online Judge"}
    />
  );
}
