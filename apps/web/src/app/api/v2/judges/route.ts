/** `/api/v2/judges`: `APIJudgeList` (api_v2.py:733), online judges only. */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { handleApiRequest, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = { page: pageFilter(url) };

    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.judges, args, options));
  });
}
