/** `/api/v2/organizations`: `APIOrganizationList` (api_v2.py:690). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { booleanFilter, handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      is_open: booleanFilter(url, "is_open"),
      id: listFilter(url, "id"),
    };

    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.organizations, args, options));
  });
}
