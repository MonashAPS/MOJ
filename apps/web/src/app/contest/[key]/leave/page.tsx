import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { LeavePanel } from "./LeavePanel";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);
  return { title: detail?.contest ? `Leave ${detail.contest.name}` : "Leave contest" };
}

/** `ContestLeave` (contests.py:468). The POST is the `leaveContest` action; this
 *  page is where a viewer without JavaScript lands to confirm it. */
export default async function ContestLeavePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const detail = await queryAsViewer(api.contests.get, { key }).catch(() => null);

  if (!detail || detail.access.kind === "notFound" || detail.access.kind === "inaccessible") notFound();
  if (!detail.contest) notFound();
  if (!detail.viewer.inContest) redirect(`/contest/${key}/`);

  const spectating = detail.participation?.virtual === -1;

  return <LeavePanel contestKey={key} contestName={detail.contest.name} spectating={spectating} />;
}
