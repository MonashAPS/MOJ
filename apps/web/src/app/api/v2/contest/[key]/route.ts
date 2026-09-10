/** `/api/v2/contest/[key]`: `APIContestDetail` (api_v2.py:239). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { handleApiRequest, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
): Promise<Response> {
  const { key } = await context.params;
  return withFilters(request, async () =>
    handleApiRequest(request, async (options) => ({
      object: await fetchQuery(api.apiV2.contest, { key }, options),
    })),
  );
}
