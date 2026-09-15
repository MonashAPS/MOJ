import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, TitleRow, TwoColumn } from "@moj/ui";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listApiTokens } from "@/app/accounts/api/token/generate/actions";
import { requireAccount } from "@/auth/account-state";
import { accountTabs } from "@/components/accounts/AccountTabs";
import { query, queryAsViewer } from "@/lib/convex-server";
import { timezoneList } from "@/lib/timezones";
import { AccountSideBoxes } from "./AccountSideBoxes";
import { EditProfileForm } from "./EditProfileForm";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("users.editProfile");
  return { title: t("title") };
}

export default async function EditProfilePage() {
  const t = await getTranslations("users.editProfile");
  const account = await requireAccount("/edit/profile/");

  const [viewerState, languages, openOrganizations, userPage, legacy, tokens] = await Promise.all([
    queryAsViewer(api.viewer.current, {}).catch(() => null),
    query(api.languages.list, {}).catch(() => []),
    query(api.site.openOrganizations, {}).catch(() => []),
    queryAsViewer(api.profiles.userPage, { username: account.username }).catch(() => null),
    queryAsViewer(api.profiles.apiTokens.mine, {}).catch(() => null),
    listApiTokens().catch(() => []),
  ]);

  const profile = viewerState?.profile ?? null;
  const needsTwoFactor = account.mustKeepTwoFactor && !account.totpEnabled && account.passkeys.length === 0;

  return (
    <>
      <TitleRow title={t("title")} tabs={await accountTabs()} active="profile" />
      <div id="content-body">
        {needsTwoFactor ? (
          <Alert variant="warning" className="mb-4">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("twoFactorRequired")}</AlertTitle>
            <AlertDescription>
              <Link href="/accounts/2fa/">{t("twoFactorSetUp")}</Link>
            </AlertDescription>
          </Alert>
        ) : null}

        <TwoColumn
          side={
            <AccountSideBoxes
              account={account}
              legacyToken={Boolean(legacy?.hasLegacyToken)}
              tokenCount={tokens.length}
            />
          }
        >
          <EditProfileForm
            about={userPage?.about ?? profile?.about ?? ""}
            timezone={profile?.timezone ?? "Australia/Melbourne"}
            languageKey={languages.find((language) => language._id === profile?.languageId)?.key ?? "PY3"}
            siteTheme={profile?.siteTheme ?? "auto"}
            editorTheme={profile?.editorTheme ?? "github"}
            organizationSlugs={(userPage?.organizations ?? [])
              .filter((organization) => openOrganizations.some((open) => open.slug === organization.slug))
              .map((organization) => organization.slug)}
            timezones={timezoneList()}
            languages={languages.map((language) => ({ key: language.key, name: language.name }))}
            organizations={openOrganizations.map((organization) => ({
              slug: organization.slug,
              name: organization.name,
            }))}
            canEditAbout={(profile?.problemCount ?? 0) > 0}
          />
        </TwoColumn>
      </div>
    </>
  );
}
