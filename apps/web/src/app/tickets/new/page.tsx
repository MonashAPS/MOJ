import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("blog.meta");

  return { title: t("newTicket") };
}

export default async function NewTicketPage() {
  const t = await getTranslations("blog.tickets");
  const viewerState = await queryAsViewer(api.viewer.current, {}).catch(() => null);

  // `NewTicketView` is `LoginRequiredMixin` (judge/views/ticket.py:53).
  if (!viewerState?.profile) redirect("/accounts/login/?next=/tickets/new/");

  return (
    <>
      <TitleRow title={t("new")} />
      <div id="content-body" className="max-w-[760px]">
        <NewTicketForm />
      </div>
    </>
  );
}
