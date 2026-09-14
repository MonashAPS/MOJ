import "server-only";

import { api } from "@convex/_generated/api";
import type { SebRequirement } from "@convex/seb";
import { headers } from "next/headers";
import { mutateAsViewer } from "@/lib/convex-server";
import { SEB_CONFIG_KEY_HEADER, SEB_REQUEST_HASH_HEADER, SEB_URL_HEADER } from "@/lib/seb";

export type SebEvidence = {
  url: string;
  configKeyHash: string | null;
  requestHash: string | null;
};

/** What this request carries, as the headers report it. */
export async function sebEvidence(): Promise<SebEvidence> {
  const jar = await headers();
  return {
    url: jar.get(SEB_URL_HEADER) ?? "",
    configKeyHash: jar.get(SEB_CONFIG_KEY_HEADER),
    requestHash: jar.get(SEB_REQUEST_HASH_HEADER),
  };
}

export const SEB_OPEN: SebRequirement = {
  locked: false,
  verified: false,
  presented: false,
  contestKey: null,
  contestName: null,
  launchUrl: null,
};

/**
 * Whether the viewer's current contest is locked, and whether this request
 * satisfies it. The keys stay in Convex; this only reports what it saw.
 *
 * It checks in rather than merely asking, because this is the request that can
 * see the headers and the reads the page is about to make cannot. A verified
 * check-in vouches for those reads for the next minute and a half.
 */
export async function sebRequirement(): Promise<SebRequirement> {
  const evidence = await sebEvidence();
  if (!evidence.url) return SEB_OPEN;
  return await mutateAsViewer(api.seb.checkIn, evidence).catch(() => SEB_OPEN);
}

/**
 * A ticket for a mutation that a locked contest gates. Null when the contest is
 * not locked, which is the usual case and is not an error — the mutations treat
 * a ticket as required only when they find a lock of their own.
 */
export async function sebTicket(contestKey: string): Promise<string | null> {
  const evidence = await sebEvidence();
  if (!evidence.url) return null;
  const result = await mutateAsViewer(api.seb.ticket, { contestKey, ...evidence }).catch(() => null);
  return result?.ticket ?? null;
}
