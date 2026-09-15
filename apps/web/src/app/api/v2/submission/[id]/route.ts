/**
 * `/api/v2/submission/[id]`: `APISubmissionDetail` (api_v2.py:637).
 *
 * `APILoginRequiredMixin` makes this the one endpoint that refuses anonymous
 * callers outright, and `Submission.can_see_detail` decides the rest.
 */

import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import { API_ERRORS, apiError, handleApiRequest, withFilters } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;

  return withFilters(request, async () => {
    if (!request.headers.get("authorization")) {
      return apiError(request, API_ERRORS.loginRequired.code, API_ERRORS.loginRequired.message);
    }

    return handleApiRequest(request, async (options) => ({
      object: await fetchQuery(api.apiV2.submission, { id }, options),
    }));
  });
}
