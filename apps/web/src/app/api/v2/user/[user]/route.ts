/** `/api/v2/user/[user]`: `APIUserDetail` (api_v2.py:513). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { handleApiRequest, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ user: string }> },
): Promise<Response> {
  const { user } = await context.params;
  return withFilters(request, async () =>
    handleApiRequest(request, async (options) => ({
      object: await fetchQuery(api.apiV2.user, { user }, options),
    })),
  );
}
