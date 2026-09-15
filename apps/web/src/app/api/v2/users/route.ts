/** `/api/v2/users`: `APIUserList` (api_v2.py:483). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      id: listFilter(url, "id"),
      username: listFilter(url, "username"),
      organization: listFilter(url, "organization"),
    };

    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.users, args, options));
  });
}
