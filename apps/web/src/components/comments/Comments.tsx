import { api } from "@convex/_generated/api";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";
import { CommentsClient } from "./CommentsClient";
import { type CommentTargetType, commentHtmlKey } from "./shared";

export type CommentsProps = {
  targetType: CommentTargetType;
  /** The problem code, contest key or blog post id the comments hang off. */
  targetKey: string;
};

/**
 * DMOJ's comment section (`templates/comments/list.html`), mounted by the problem,
 * contest, editorial and blog post pages.
 *
 * The tree and every body are rendered on the server; the client subscribes for
 * new comments, votes, edits and hides, and renders the rows that changed.
 */
export async function Comments({ targetType, targetKey }: CommentsProps) {
  const [data, viewerState] = await Promise.all([
    queryAsViewer(api.comments.list, { targetType, targetKey }).catch(() => null),
    queryAsViewer(api.viewer.current, {}).catch(() => null),
  ]);
  if (!data) return null;

  const rendered = await Promise.all(
    data.comments.map(
      async (comment) =>
        [commentHtmlKey(comment), await renderContent(comment.body, comment.bodyPreset)] as const,
    ),
  );

  return (
    <CommentsClient
      targetType={targetType}
      targetKey={targetKey}
      initial={data}
      initialHtml={Object.fromEntries(rendered)}
      viewerUsername={viewerState?.profile?.username ?? null}
      signedIn={viewerState?.profile != null}
    />
  );
}
