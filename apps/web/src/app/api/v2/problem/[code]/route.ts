/** `/api/v2/problem/[code]`: `APIProblemDetail` (api_v2.py:440). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { handleApiRequest, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;
  return withFilters(request, async () =>
    handleApiRequest(request, async (options) => ({
      object: await fetchQuery(api.apiV2.problem, { code }, options),
    })),
  );
}
