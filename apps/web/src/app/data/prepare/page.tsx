import { TitleRow } from "@moj/ui";
import { redirect } from "next/navigation";
import { getServerSession } from "@/auth/session";
import { PrepareDataForm } from "./PrepareDataForm";

export const metadata = { title: "Download your data" };
export const dynamic = "force-dynamic";

export default async function PrepareDataPage() {
  const session = await getServerSession();
  if (!session) redirect("/accounts/login/?next=/data/prepare/");

  return (
    <>
      <TitleRow title="Download your data" />
      <div id="content-body">
        <PrepareDataForm />
      </div>
    </>
  );
}
