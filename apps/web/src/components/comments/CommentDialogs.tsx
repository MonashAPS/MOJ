"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Button,
  ContentDescription,
  cn,
  Dialog,
  DialogContent,
  EmptyRow,
  RatingName,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { renderUserMarkdown } from "@/components/markdown/actions";
import { formatDateTime } from "@/lib/format";

const DASH = "—";

/** `CommentRevisionAjax`: DMOJ's ← / → revision walk, as a dialog. */
export function CommentHistoryDialog({
  commentId,
  open,
  onOpenChange,
}: {
  commentId: Id<"comments">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const revisions = useQuery(api.comments.history, open ? { commentId } : "skip");
  const [index, setIndex] = useState(0);
  const [html, setHtml] = useState("");

  const current = revisions?.[index] ?? null;
  const body = current?.body ?? "";
  const preset = current?.bodyPreset ?? "comment";

  useEffect(() => {
    if (revisions && revisions.length > 0) setIndex(revisions.length - 1);
  }, [revisions]);

  useEffect(() => {
    let live = true;
    if (body.trim().length === 0) {
      setHtml("");
      return;
    }
    void renderUserMarkdown(body, preset).then((rendered) => {
      if (live) setHtml(rendered);
    });
    return () => {
      live = false;
    };
  }, [body, preset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit history"
        description="Every revision of this comment, oldest first."
        width={640}
      >
        {revisions === undefined ? (
          <div className="grid gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : revisions === null || revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">This comment has no recorded history.</p>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-1">
              {revisions.map((revision, position) => (
                <Button
                  key={revision.createdAt}
                  size="sm"
                  variant={position === index ? "primary" : "ghost"}
                  onClick={() => setIndex(position)}
                  className={cn(position !== index && "text-subtle")}
                >
                  {position === 0 ? "Original" : `Edit ${position}`}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {current?.author ? (
                <RatingName
                  username={current.author.username}
                  displayName={current.author.displayName}
                  rating={current.author.rating}
                  href={`/user/${current.author.username}`}
                  isAdmin={current.author.displayRank === "admin"}
                />
              ) : (
                DASH
              )}
              {current ? ` · ${formatDateTime(current.createdAt)}` : null}
              {current?.reason ? ` · ${current.reason}` : null}
            </p>
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-card p-3">
              <ContentDescription html={html} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** `CommentVotesAjax` (moderators only). */
export function CommentVotesDialog({
  commentId,
  open,
  onOpenChange,
}: {
  commentId: Id<"comments">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const votes = useQuery(api.comments.votes, open ? { commentId } : "skip");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Votes" description="Who voted on this comment." width={480}>
        {votes === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Voter</TableHead>
                <TableHead numeric>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {votes === null || votes.length === 0 ? (
                <EmptyRow colSpan={2}>No votes.</EmptyRow>
              ) : (
                votes.map((vote) => (
                  <TableRow key={vote._id}>
                    <TableCell>
                      {vote.voter ? (
                        <RatingName
                          username={vote.voter.username}
                          displayName={vote.voter.displayName}
                          rating={vote.voter.rating}
                          href={`/user/${vote.voter.username}`}
                          isAdmin={vote.voter.displayRank === "admin"}
                        />
                      ) : (
                        DASH
                      )}
                    </TableCell>
                    <TableCell numeric>{vote.score > 0 ? `+${vote.score}` : vote.score}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
