import { api } from "@convex/_generated/api";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";
import { TicketClient } from "./TicketClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ pk: string }> };

export async function generateMetadata({ params }: Props) {
  const ticket = await queryAsViewer(api.tickets.get, { id: (await params).pk }).catch(() => null);

  if (!ticket) {
    const t = await getTranslations("common.states");

    return { title: t("notFound") };
  }

  const t = await getTranslations("blog.meta");

  return { title: t("ticket", { title: ticket.title }) };
}

export default async function TicketPage({ params }: Props) {
  const { pk } = await params;

  const [ticket, viewerState] = await Promise.all([
    queryAsViewer(api.tickets.get, { id: pk }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);

  // `TicketMixin` is `LoginRequiredMixin` and 404s anyone else (ticket.py:110).
  if (!viewerState?.profile) redirect(`/accounts/login/?next=/ticket/${encodeURIComponent(pk)}/`);

  if (!ticket) notFound();

  const rendered = await Promise.all(
    ticket.messages.map(
      async (message) =>
        [`${message._id} ${message.body}`, await renderContent(message.body, message.bodyPreset)] as const,
    ),
  );

  return <TicketClient ticketId={ticket._id} initial={ticket} initialHtml={Object.fromEntries(rendered)} />;
}
