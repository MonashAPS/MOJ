"use client";

import { api } from "@convex/_generated/api";
import { Badge, Button, cn, EmptyState, RatingName } from "@moj/ui";
import { useQuery } from "convex/react";
import { EyeOff, MessageSquare } from "lucide-react";
import { useState } from "react";
import { formatRelative } from "@/lib/format";

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

type CommentNode = NonNullable<(typeof api.comments.list)["_returnType"]>["comments"][number];

/**
 * Placeholder. The comments agent owns the real component; this one keeps the
 * same props and the ordering rules the parity audit asks for, so the problem
 * and editorial pages are honest until it lands.
 *
 * `comments.list` already returns roots newest first with replies oldest first
 * inside a thread, each row carrying its depth, its `belowThreshold` flag and
 * whether the viewer may see a hidden row.
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
          title="No comments"
          description="No comments yet — be the first."
        />
      ) : (
        <ol className="grid gap-3">
          {data.comments.map((comment) => (
            <li key={comment._id} style={{ marginLeft: `${Math.min(comment.depth, 4) * 20}px` }}>
              <Comment comment={comment} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Comment({ comment }: { comment: CommentNode }) {
  // DMOJ collapses a comment at or below the vote-hide threshold behind
  // "Show it anyway."; the body is still in the page for a moderator.
  const [revealed, setRevealed] = useState(false);
  const collapsed = comment.belowThreshold && !revealed;

  return (
    <article className={cn("rounded-md border border-border bg-card p-3", comment.hidden && "opacity-60")}>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
        <span className="font-mono tabular-nums">
          {comment.score > 0 ? `+${comment.score}` : comment.score}
        </span>
        {comment.hidden ? (
          <Badge variant="neutral">
            <EyeOff size={11} aria-hidden /> Hidden
          </Badge>
        ) : null}
      </p>
      {collapsed ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          This comment is below the score threshold.
          <Button variant="link" size="sm" onClick={() => setRevealed(true)}>
            Show it anyway
          </Button>
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-base text-foreground">{comment.body}</p>
      )}
    </article>
  );
}

export default Comments;
