/** `/api/v2/participations`: `APIContestParticipationList` (api_v2.py:334). */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import {
  basicFilter,
  booleanFilter,
  handleApiRequest,
  numberFilter,
  pageFilter,
  withFilters,
} from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      contest: basicFilter(url, "contest"),
      user: basicFilter(url, "user"),
      is_disqualified: booleanFilter(url, "is_disqualified"),
      virtual_participation_number: numberFilter(url, "virtual_participation_number"),
    };
    return handleApiRequest(request, (options) => fetchQuery(api.apiV2.participations, args, options));
  });
}
