import { api } from "@convex/_generated/api";
import { EmptyState, TitleRow } from "@moj/ui";
import { UserX } from "lucide-react";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { timezoneList } from "@/lib/timezones";
import { Crumbs } from "../../_components/Crumbs";
import { consoleViewer } from "../../_lib/guard";
import { accountForUserAction } from "../actions";
import { UserEditor } from "./UserEditor";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: decodeURIComponent(username) };
}

export default async function AdminUserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username: raw } = await params;
  const username = decodeURIComponent(raw);

  const viewer = await consoleViewer();
  if (!viewer) notFound();

  const [user, extras, permissionCodes, languages, organizations] = await Promise.all([
    queryAsViewer(api.admin.users.get, { username }).catch(() => null),
    queryAsViewer(api.pages.admin2.userExtras, { username }),
    queryAsViewer(api.admin.users.permissionCodes, {}).catch(() => [] as string[]),
    queryAsViewer(api.languages.list, {}).catch(() => []),
    queryAsViewer(api.admin.organizations.list, {}).catch(() => []),
  ]);

  if (!user) {
    return (
      <>
        <TitleRow
          title={username}
          breadcrumb={<Crumbs items={[{ label: "Users", href: "/admin/users/" }, { label: username }]} />}
        />
        <EmptyState
          icon={<UserX aria-hidden />}
          title="No such user"
          description={`Nobody on this site is called ${username}.`}
        />
      </>
    );
  }

  const account = await accountForUserAction(user.userId);

  return (
    <>
      <TitleRow
        title={user.displayName}
        breadcrumb={<Crumbs items={[{ label: "Users", href: "/admin/users/" }, { label: user.username }]} />}
      />
      <UserEditor
        user={user}
        extras={extras}
        permissionCodes={permissionCodes}
        languages={languages.map((language) => ({ key: language.key, name: language.name }))}
        organizations={organizations.map((organization) => ({
          slug: organization.slug,
          name: organization.name,
        }))}
        timezones={timezoneList()}
        account={account.ok ? account.data : { account: null, passkeys: [], sessions: 0 }}
        viewerIsSuperuser={viewer.isSuperuser}
        viewerUsername={viewer.username}
      />
    </>
  );
}
