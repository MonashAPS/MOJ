import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, TitleRow } from "@moj/ui";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { query, queryAsViewer } from "@/lib/convex-server";
import { timezoneList } from "@/lib/timezones";
import { EditProfileForm } from "./EditProfileForm";

export const metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const session = await getServerSession();
  if (!session) redirect("/accounts/login/?next=/edit/profile/");

  const [viewerState, languages] = await Promise.all([
    queryAsViewer(api.viewer.current, {}),
    query(api.languages.list, {}).catch(() => []),
  ]);
  const profile = viewerState?.profile ?? null;

  const needsTwoFactor =
    (profile?.isStaff || profile?.isSuperuser) &&
    !(session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled;

  return (
    <>
      <TitleRow title="Edit profile" />
      <div id="content-body" className="grid gap-4">
        {needsTwoFactor ? (
          <Alert variant="warning" className="max-w-[44rem]">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>Staff accounts must have two factor authentication enabled.</AlertTitle>
            <AlertDescription>
              <Link href="/accounts/2fa/">Set it up now</Link>
            </AlertDescription>
          </Alert>
        ) : null}
        <EditProfileForm
          username={profile?.username ?? session.user.name}
          about={profile?.about ?? ""}
          timezone={profile?.timezone ?? "Australia/Melbourne"}
          languageKey={languages.find((language) => language._id === profile?.languageId)?.key ?? "PY3"}
          siteTheme={profile?.siteTheme ?? "auto"}
          editorTheme={profile?.editorTheme ?? "github"}
          timezones={timezoneList()}
          languages={languages.map((language) => ({ key: language.key, name: language.name }))}
        />
      </div>
    </>
  );
}
