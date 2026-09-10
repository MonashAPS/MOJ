/** `/api/v2/problems`: `APIProblemList` (api_v2.py:395). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { booleanFilter, handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const search = listFilter(url, "search");
    const args = {
      page: pageFilter(url),
      partial: booleanFilter(url, "partial"),
      code: listFilter(url, "code"),
      group: listFilter(url, "group"),
      type: listFilter(url, "type"),
      organization: listFilter(url, "organization"),
      search: search ? search.join(" ").trim() : undefined,
    };
    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.problems, args, options));
  });
}
