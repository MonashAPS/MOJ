/**
 * `/api/v2/submissions`: `APISubmissionList` (api_v2.py:570).
 *
 * `use_infinite_pagination` is true when no basic filter was used, and an
 * infinite page carries no `total_objects` or `total_pages`. The Convex query
 * reports which branch it took; that flag is not part of the envelope.
 */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { basicFilter, handleApiRequest, listFilter, pageFilter, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withFilters(request, async (url) => {
    const args = {
      page: pageFilter(url),
      user: basicFilter(url, "user"),
      problem: basicFilter(url, "problem"),
      contest: basicFilter(url, "contest"),
      id: listFilter(url, "id"),
      language: listFilter(url, "language"),
      result: listFilter(url, "result"),
    };
    return handleApiRequest(request, async (options) => {
      const { used_basic_filters: _used, ...data } = await fetchQuery(api.apiV2.submissions, args, options);
      return data;
    });
  });
}
