/** `/api/v2/languages`: `APILanguageList` (api_v2.py:710). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { basicFilter, handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      common_name: basicFilter(url, "common_name"),
      id: listFilter(url, "id"),
      key: listFilter(url, "key"),
    };

    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.languages, args, options));
  });
}
