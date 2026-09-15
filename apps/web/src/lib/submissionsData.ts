import { api } from "@convex/_generated/api";
import type {
  SubmissionListContext,
  SubmissionSourceView,
  SubmissionStatusExtras,
} from "@convex/pages/submissions";
import { queryAsViewer } from "@/lib/convex-server";

/**
 * The submission pages read their context from `convex/pages/submissions.ts`:
 * the filter panel's options, the access check every list runs, the judge a
 * submission ran on, the language's time-limit override, the slowest case, a
 * contest problem's output-prefix clip and the abort, rejudge and resubmit flags.
 */
export type ListContext = SubmissionListContext;

export type StatusExtras = SubmissionStatusExtras;

export type SourceView = SubmissionSourceView;

export async function loadListContext(args: {
  username?: string;
  problemCode?: string;
  contestKey?: string;
}): Promise<ListContext> {
  return await queryAsViewer(api.pages.submissions.listContext, args);
}

export async function loadStatusExtras(id: string): Promise<StatusExtras | null> {
  return await queryAsViewer(api.pages.submissions.statusExtras, { submissionId: id });
}

export async function loadSourceView(id: string): Promise<SourceView | null> {
  return await queryAsViewer(api.pages.submissions.sourceView, { submissionId: id });
}
