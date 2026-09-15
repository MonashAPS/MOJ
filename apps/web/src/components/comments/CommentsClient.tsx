"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Alert, AlertDescription, EmptyState } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { renderUserMarkdownBatch } from "@/components/markdown/actions";
import { CommentForm } from "./CommentForm";
import { CommentRow } from "./CommentRow";
import { type CommentList, type CommentTargetType, commentHtmlKey } from "./shared";

/** `Comment.body` max_length (judge/models/comment.py); `siteSettings` may lower
 *  it, and the mutation says so if it has. */
const COMMENT_MAX_BODY = 8192;

export function CommentsClient({
  targetType,
  targetKey,
  initial,
  initialHtml,
  viewerUsername,
  signedIn,
}: {
  targetType: CommentTargetType;
  targetKey: string;
  initial: CommentList;
  initialHtml: Record<string, string>;
  viewerUsername: string | null;
  signedIn: boolean;
}) {
  const t = useTranslations("blog.comments");
  const live = useQuery(api.comments.list, { targetType, targetKey });
  const data = live ?? initial;
  const post = useMutation(api.comments.post);

  const [html, setHtml] = useState(initialHtml);
  const requested = useRef(new Set(Object.keys(initialHtml)));

  // A live update can bring in a comment the server never rendered, or a body
  // that was edited. Only those rows go back to the renderer.
  useEffect(() => {
    const missing = data.comments
      .map((comment) => ({ key: commentHtmlKey(comment), source: comment.body, preset: comment.bodyPreset }))
      .filter((item) => !requested.current.has(item.key));

    if (missing.length === 0) return;

    for (const item of missing) requested.current.add(item.key);

    let alive = true;
    void renderUserMarkdownBatch(missing).then((rendered) => {
      if (alive) setHtml((previous) => ({ ...previous, ...rendered }));
    });

    return () => {
      alive = false;
    };
  }, [data.comments]);

  const visible = data.comments.filter((comment) => !comment.hidden).length;

  async function reply(parentId: Id<"comments">, body: string) {
    await post({ targetType, targetKey, parentId, body });
  }

  return (
    <section id="comments" className="mt-8">
      <h2 className="flex items-center gap-2">
        <MessageSquare className="size-5 text-muted-foreground" aria-hidden />
        {t("heading")}
        <span className="font-mono text-h3 font-medium tabular-nums text-muted-foreground">{visible}</span>
      </h2>
      <hr className="page-rule mb-5 mt-3" />

      {data.locked ? (
        <Alert variant="warning" className="mb-5">
          <AlertDescription>{t("locked")}</AlertDescription>
        </Alert>
      ) : null}

      {data.comments.length === 0 ? (
        <EmptyState
          icon={<MessageSquare aria-hidden />}
          title={t("emptyTitle")}
          description={data.locked ? t("emptyLocked") : t("emptyOpen")}
        />
      ) : (
        <div className="grid">
          {data.comments.map((comment) => (
            <CommentRow
              key={comment._id}
              comment={comment}
              html={html[commentHtmlKey(comment)] ?? ""}
              signedIn={signedIn}
              viewerUsername={viewerUsername}
              maxLength={COMMENT_MAX_BODY}
              onReply={reply}
            />
          ))}
        </div>
      )}

      <NewComment
        data={data}
        signedIn={signedIn}
        onSubmit={(body) => post({ targetType, targetKey, body })}
      />
    </section>
  );
}

function NewComment<TAnswer>({
  data,
  signedIn,
  onSubmit,
}: {
  data: CommentList;
  signedIn: boolean;
  onSubmit: (body: string) => Promise<TAnswer>;
}) {
  const t = useTranslations("blog.comments");

  if (data.locked) return null;

  return (
    <div id="new-comment" className="mt-8">
      <h3>{t("newHeading")}</h3>
      <hr className="page-rule mb-4 mt-3" />
      {!signedIn ? (
        <p className="text-sm text-muted-foreground">
          {t.rich("logInPrompt", {
            login: (chunks) => (
              <Link href="/accounts/login/" className="text-link">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : data.isMuted ? (
        <Alert variant="info">
          <AlertDescription>{t("muted")}</AlertDescription>
        </Alert>
      ) : data.isNewUser ? (
        <Alert variant="info">
          <AlertDescription>{t("newUser")}</AlertDescription>
        </Alert>
      ) : (
        <CommentForm maxLength={COMMENT_MAX_BODY} onSubmit={onSubmit} />
      )}
    </div>
  );
}
