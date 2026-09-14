"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  ContentDescription,
  cn,
  Dialog,
  DialogContent,
  focusRing,
  RatingName,
  Tooltip,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { BarChart3, ChevronDown, ChevronUp, Eye, Link2, Pencil, Reply, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { identiconUrl, initials } from "@/lib/avatar";
import { mutationError } from "@/lib/convex-error";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CommentHistoryDialog, CommentVotesDialog } from "./CommentDialogs";
import { CommentForm } from "./CommentForm";
import { type CommentNode, commentAnchor } from "./shared";

/** DMOJ nests one `<ul>` per level; past six the indent stops so a long thread
 *  still fits a phone. */
const INDENT_STEP = 22;
const MAX_INDENT_DEPTH = 6;

export function CommentRow({
  comment,
  html,
  signedIn,
  viewerUsername,
  maxLength,
  onReply,
}: {
  comment: CommentNode;
  html: string;
  signedIn: boolean;
  viewerUsername: string | null;
  maxLength: number;
  onReply: (parentId: Id<"comments">, body: string) => Promise<unknown>;
}) {
  const t = useTranslations("blog.comments");
  const common = useTranslations("common.actions");
  const vote = useMutation(api.comments.vote);
  const unvote = useMutation(api.comments.unvote);
  const edit = useMutation(api.comments.edit);
  const hide = useMutation(api.comments.hide);
  const unhide = useMutation(api.comments.unhide);

  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [votes, setVotes] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const author = comment.author;
  const isOwn = author !== null && viewerUsername !== null && author.username === viewerUsername;
  const collapsed = comment.belowThreshold && !revealed;
  const indent = Math.min(comment.depth, MAX_INDENT_DEPTH) * INDENT_STEP;

  const voteTitle = !signedIn ? t("voteLogIn") : isOwn ? t("voteOwn") : undefined;

  async function castVote(delta: 1 | -1) {
    setError(null);
    try {
      if (comment.myVote === delta) await unvote({ commentId: comment._id });
      else await vote({ commentId: comment._id, delta });
    } catch (thrown) {
      setError(mutationError(thrown, t("voteFailed")));
    }
  }

  async function setHidden(next: boolean) {
    setError(null);
    try {
      if (next) await hide({ commentId: comment._id });
      else await unhide({ commentId: comment._id, includeReplies: true });
    } catch (thrown) {
      setError(mutationError(thrown, next ? t("hideFailed") : t("unhideFailed")));
    }
  }

  return (
    <article
      id={commentAnchor(comment)}
      style={{ marginLeft: indent }}
      className={cn(
        "scroll-mt-24 border-t border-border py-4 first:border-t-0 first:pt-0",
        comment.depth > 0 && "border-l border-l-border pl-3",
        "target:bg-row-selected",
      )}
    >
      <div className="flex gap-3">
        <div className="grid w-7 shrink-0 justify-items-center gap-0.5 pt-0.5">
          <VoteArrow
            direction="up"
            active={comment.myVote === 1}
            disabled={!signedIn || isOwn || comment.hidden}
            title={voteTitle}
            onClick={() => castVote(1)}
          />
          <span
            className="font-mono text-sm font-medium tabular-nums text-subtle"
            title={t("scoreTitle", { score: comment.score })}
          >
            {comment.score}
          </span>
          <VoteArrow
            direction="down"
            active={comment.myVote === -1}
            disabled={!signedIn || isOwn || comment.hidden}
            title={voteTitle}
            onClick={() => castVote(-1)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Avatar className="size-6 shrink-0">
              <AvatarImage src={identiconUrl(author?.username ?? "deleted", 48)} alt="" />
              <AvatarFallback>{initials(author?.displayName ?? "?")}</AvatarFallback>
            </Avatar>
            {author ? (
              <RatingName
                username={author.username}
                displayName={author.displayName}
                rating={author.rating}
                href={`/user/${author.username}`}
                isAdmin={author.displayRank === "admin"}
                className="shrink-0"
              />
            ) : (
              <span className="shrink-0 font-mono text-muted-foreground">{t("deletedUser")}</span>
            )}
            <time
              dateTime={new Date(comment.time).toISOString()}
              title={formatDateTime(comment.time)}
              className="shrink-0 text-sm text-muted-foreground"
            >
              {t("commented", { time: formatRelative(comment.time) })}
            </time>
            {comment.revisions > 1 ? (
              <button
                type="button"
                onClick={() => setHistory(true)}
                className={cn(
                  "shrink-0 rounded-sm px-1 text-sm text-muted-foreground underline underline-offset-4",
                  "transition-colors hover:text-subtle",
                  focusRing,
                )}
              >
                {comment.revisions > 2 ? t("editNumber", { number: comment.revisions - 1 }) : t("edited")}
              </button>
            ) : null}
            {comment.hidden ? (
              <Badge variant="neutral" className="shrink-0">
                {t("hiddenBadge")}
              </Badge>
            ) : null}

            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <RowAction label={t("actionLink")} href={`#${commentAnchor(comment)}`}>
                <Link2 aria-hidden />
              </RowAction>
              {comment.canReply ? (
                <RowAction label={t("actionReply")} onClick={() => setReplying((open) => !open)}>
                  <Reply aria-hidden />
                </RowAction>
              ) : null}
              {comment.canEdit ? (
                <RowAction label={common("edit")} onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                </RowAction>
              ) : null}
              {comment.canModerate ? (
                <RowAction label={t("actionVotes")} onClick={() => setVotes(true)}>
                  <BarChart3 aria-hidden />
                </RowAction>
              ) : null}
              {comment.canModerate ? (
                comment.hidden ? (
                  <RowAction label={t("actionUnhide")} onClick={() => setHidden(false)}>
                    <Eye aria-hidden />
                  </RowAction>
                ) : (
                  <RowAction label={t("actionHide")} onClick={() => setConfirmHide(true)}>
                    <Trash2 aria-hidden />
                  </RowAction>
                )
              ) : null}
            </span>
          </header>

          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger-ink">
              {error}
            </p>
          ) : null}

          {collapsed ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t.rich("collapsed", {
                reveal: (chunks) => (
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className={cn("rounded-sm text-link underline underline-offset-4", focusRing)}
                  >
                    {chunks}
                  </button>
                ),
              })}
            </p>
          ) : (
            <ContentDescription html={html} className="mt-2" />
          )}

          {replying ? (
            <div className="mt-4 rounded-md border border-border p-3">
              <CommentForm
                heading={t("replyHeading")}
                maxLength={maxLength}
                autoFocus
                rows={5}
                onCancel={() => setReplying(false)}
                onSubmit={async (body) => {
                  await onReply(comment._id, body);
                  setReplying(false);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={t("editDialogTitle")} width={720}>
          <CommentForm
            initialValue={comment.body}
            maxLength={maxLength}
            clearOnSuccess={false}
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await edit({ commentId: comment._id, body });
              setEditing(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <CommentHistoryDialog commentId={comment._id} open={history} onOpenChange={setHistory} />
      <CommentVotesDialog commentId={comment._id} open={votes} onOpenChange={setVotes} />

      <AlertDialog open={confirmHide} onOpenChange={setConfirmHide}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hideTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hideDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setHidden(true)}>{t("actionHide")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function VoteArrow({
  direction,
  active,
  disabled,
  title,
  onClick,
}: {
  direction: "up" | "down";
  active: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
}) {
  const t = useTranslations("blog.comments");
  const label = direction === "up" ? t("upvote") : t("downvote");
  const Glyph = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <Tooltip content={title ?? label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        title={title}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex size-6 items-center justify-center rounded-sm transition-colors duration-(--dur-fast)",
          active ? "text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          focusRing,
        )}
      >
        <Glyph className="size-4" aria-hidden />
      </button>
    </Tooltip>
  );
}

function RowAction({
  label,
  href,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      {href ? (
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground"
        >
          <a href={href}>{children}</a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground hover:text-foreground"
        >
          {children}
        </Button>
      )}
    </Tooltip>
  );
}
