import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { redirect } from "next/navigation";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  const viewerState = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  // `NewTicketView` is `LoginRequiredMixin` (judge/views/ticket.py:53).
  if (!viewerState?.profile) redirect("/accounts/login/?next=/tickets/new/");

  return (
    <>
      <TitleRow title="New ticket" />
      <div id="content-body" className="max-w-[760px]">
        <NewTicketForm />
      </div>
    </>
  );
}
