import { NextResponse } from "next/server";
import { sebTicket } from "@/lib/seb.server";

export const dynamic = "force-dynamic";

/**
 * Mint a Safe Exam Browser ticket for the caller's current contest.
 *
 * The submit form asks for one immediately before submitting, because this is
 * the only kind of request where the headers SEB attaches can be seen at all —
 * a Convex mutation arrives over a websocket that carries none. The ticket is
 * good for about a minute and is bound to the caller and the contest, so a
 * competitor sitting in SEB cannot usefully hand tickets to anybody else.
 *
 * No ticket is not an error. A contest that is not locked needs none, and the
 * mutations only insist on one when they find a lock of their own.
 */
export async function GET(request: Request) {
  const contestKey = new URL(request.url).searchParams.get("contest");
  if (!contestKey) {
    return NextResponse.json({ ticket: null }, { status: 400 });
  }
  return NextResponse.json(
    { ticket: await sebTicket(contestKey) },
    { headers: { "cache-control": "no-store" } },
  );
}
