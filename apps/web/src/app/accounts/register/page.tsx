import { api } from "@convex/_generated/api";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { query } from "@/lib/convex-server";
import { timezoneList } from "@/lib/timezones";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata() {
  const t = await getTranslations("auth.register");
  return { title: t("metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [settings, languages, organizations] = await Promise.all([
    query(api.site.settings, {}).catch(() => null),
    query(api.languages.list, {}).catch(() => []),
    query(api.site.openOrganizations, {}).catch(() => []),
  ]);

  if (settings && !settings.registrationOpen) redirect("/accounts/login/");

  return (
    <RegisterForm
      timezones={timezoneList()}
      defaultTimezone={settings?.defaultUserTimezone ?? "Australia/Melbourne"}
      defaultLanguageKey={settings?.defaultUserLanguageKey ?? "PY3"}
      languages={languages.map((language) => ({ key: language.key, name: language.name }))}
      organizations={organizations.map((organization) => ({
        slug: organization.slug,
        name: organization.name,
      }))}
    />
  );
}
