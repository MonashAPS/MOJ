import type { Id } from "@convex/_generated/dataModel";
import { renderContent } from "@/lib/markdown";
import { TicketClient, type TicketDetail } from "../ticket/[pk]/TicketClient";

export const dynamic = "force-dynamic";

/** TEMPORARY: renders the ticket page's layout from a fixture so it can be
 *  reviewed while staff sign-in is blocked by the 2FA gate. Delete before
 *  merging. */
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 8, 10, 4, 0, 0);

function profile(id: string, username: string, rating: number | undefined, rank = "user") {
  return {
    _id: id as Id<"profiles">,
    username,
    displayName: username,
    rating,
    displayRank: rank,
  };
}

const FIXTURE: TicketDetail = {
  _id: "q97d8dqwkayqrgkttt6zn2fryn8e58n9" as Id<"tickets">,
  legacyId: 13,
  title: "Clarification for sample 3",
  time: NOW - 30 * HOUR,
  isOpen: true,
  notes: "Statement is right; the explanation drops a case. Rewriting the sample text.",
  author: profile("nx7d17qrjfxbrrvhza19fjv0r18e5c49", "emertylover445", 2120),
  assignees: [profile("nx78yxznr76hxy1dr8g1gh4wjn8e4tj8", "PenguinDevs", 1840, "admin")],
  linkedType: "problem",
  linkedKey: "lightsperfectvictory",
  linkedTitle: "Light's Perfect Victory",
  linkedHref: "/problem/lightsperfectvictory",
  messageCount: 3,
  lastMessageTime: NOW - 2 * HOUR,
  href: "/ticket/13",
  messages: [
    {
      _id: "q576cyj76c3hvm0z49qeg11ays8e4gmv" as Id<"ticketMessages">,
      body: "The explanation for sample 3 uses `3 5 7`, but the input block says `3 5 6`.\n\n- expected: **6**\n- printed: *7*\n\nBoth give the same answer, so I think only the explanation is wrong.",
      bodyPreset: "ticket",
      time: NOW - 30 * HOUR,
      author: profile("nx7d17qrjfxbrrvhza19fjv0r18e5c49", "emertylover445", 2120),
    },
    {
      _id: "q579g57vmgw1kz2dqazft1psh98e5z5w" as Id<"ticketMessages">,
      body: "Good catch, thanks. The bound in the statement is ~n \\le 10^5~ either way, so no re-judge is needed.",
      bodyPreset: "ticket",
      time: NOW - 26 * HOUR,
      author: profile("nx78yxznr76hxy1dr8g1gh4wjn8e4tj8", "PenguinDevs", 1840, "admin"),
    },
    {
      _id: "q572vxh3mwfjcbg19cvzjwq8fh8e5tss" as Id<"ticketMessages">,
      body: "> Both give the same answer\n\nThey do. I have rewritten the explanation and reuploaded the statement.",
      bodyPreset: "ticket",
      time: NOW - 2 * HOUR,
      author: profile("nx78yxznr76hxy1dr8g1gh4wjn8e4tj8", "PenguinDevs", 1840, "admin"),
    },
  ],
  canEditNotes: true,
  canAssign: true,
  canSetOpen: true,
  canReply: true,
};

export default async function DevTicket() {
  const rendered = await Promise.all(
    FIXTURE.messages.map(
      async (message) =>
        [`${message._id} ${message.body}`, await renderContent(message.body, message.bodyPreset)] as const,
    ),
  );
  return (
    <TicketClient
      ticketId={FIXTURE._id}
      initial={FIXTURE}
      initialHtml={Object.fromEntries(rendered)}
    />
  );
}
