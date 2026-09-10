/** `/api/v2/contests`: `APIContestList` (judge/views/api/api_v2.py:190). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { booleanFilter, handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      is_rated: booleanFilter(url, "is_rated"),
      key: listFilter(url, "key"),
      tag: listFilter(url, "tag"),
      organization: listFilter(url, "organization"),
    };
    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.contests, args, options));
  });
}
