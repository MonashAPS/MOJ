import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { queryAsViewer } from "@/lib/convex-server";
import { PrepareDataForm } from "./PrepareDataForm";

export const metadata = { title: "Download your data" };
export const dynamic = "force-dynamic";

export default async function PrepareDataPage() {
  const session = await getServerSession();
  if (!session) redirect("/accounts/login/?next=/data/prepare/");

  // `UserDataMixin.dispatch`: a muted account has no data download at all.
  const viewer = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  if (viewer?.profile?.mute) notFound();

  return (
    <>
      <TitleRow title="Download your data" />
      <div id="content-body">
        <PrepareDataForm />
      </div>
    </>
  );
}
