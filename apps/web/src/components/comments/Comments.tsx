"use client";

import { api } from "@convex/_generated/api";
import { EmptyState, Panel } from "@moj/ui";
import { useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

/**
 * The comment thread under a page.
 *
 * The community agent owns the real one, with voting, replies and the editor;
 * this is the seam the pages write against so the thread appears the moment
 * that component lands, and it renders the real thread meanwhile.
 */
export function Comments({
  targetType,
  targetKey,
}: {
  targetType: CommentTargetType;
  targetKey: string;
}) {
  const thread = useQuery(api.comments.list, { targetType, targetKey });
  if (thread === null) return null;

  const comments = thread?.comments ?? [];
  const title = comments.length === 1 ? "1 comment" : `${comments.length} comments`;

  return (
    <section id="comments" className="mt-8">
      <Panel title={title} icon={<MessageSquare size={14} aria-hidden />} bodyClassName="p-0">
        {thread === undefined ? null : comments.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<MessageSquare aria-hidden />}
            title="No comments"
            description="No comments yet — be the first."
          />
        ) : (
          <ul>
            {comments.map((comment) => (
              <li key={comment._id} className="border-b border-border p-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rating font-mono text-sm font-medium">
                    {comment.author?.displayName ?? "Unknown"}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {formatDateTime(comment.time)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-base text-foreground">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
