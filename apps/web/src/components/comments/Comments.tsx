"use client";

import { api } from "@convex/_generated/api";
import { EmptyState, RatingName } from "@moj/ui";
import { useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import { formatRelative } from "@/lib/format";

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

/**
 * Placeholder. The comments agent owns the real component; this one exists so the
 * problem pages compile and render something truthful against the same props.
 */
export function Comments({ targetType, targetKey }: { targetType: CommentTargetType; targetKey: string }) {
  const data = useQuery(api.comments.list, { targetType, targetKey });
  if (data === undefined || data === null) return null;

  return (
    <section id="comments" className="mt-8">
      <h2 className="mb-3 font-display text-h2 font-bold tracking-tight text-foreground">Comments</h2>
      {data.comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={20} />}
          title="No comments yet"
          description="No comments yet — be the first."
        />
      ) : (
        <ol className="grid gap-3">
          {data.comments.map((comment) => (
            <li key={comment._id} className="rounded-md border border-border bg-card p-3">
              <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                {comment.author ? (
                  <RatingName
                    username={comment.author.username}
                    rating={comment.author.rating}
                    href={`/user/${comment.author.username}`}
                    isAdmin={comment.author.displayRank === "admin"}
                  />
                ) : (
                  <span>Deleted user</span>
                )}
                <time dateTime={new Date(comment.time).toISOString()}>{formatRelative(comment.time)}</time>
              </p>
              <p className="whitespace-pre-wrap text-base text-foreground">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default Comments;
