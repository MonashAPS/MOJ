import type { api } from "@convex/_generated/api";
import { cn, RatingName } from "@moj/ui";
import type { FunctionReturnType } from "convex/server";
import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatDateTime } from "@/lib/format";

export type BlogListItem = FunctionReturnType<typeof api.blog.list>[number];

/** One `section.post` from DMOJ's blog list. A sticky post keeps the club's royal
 *  rail rather than DMOJ's star-in-the-byline. */
export function PostCard({
  post,
  children,
  showContinue = true,
}: {
  post: BlogListItem;
  children: ReactNode;
  showContinue?: boolean;
}) {
  const comments = post.commentCount;
  return (
    <article
      className={cn(
        "rounded-md border border-border bg-card p-4",
        post.sticky && "border-l-[3px] border-l-royal",
      )}
    >
      <h2 className="flex items-start gap-2 text-h2">
        {post.sticky ? <Pin className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Pinned" /> : null}
        <Link href={post.href} className="min-w-0 text-link">
          {post.title}
        </Link>
      </h2>

      <p className="mt-1 text-sm text-muted-foreground">
        posted on{" "}
        <time dateTime={new Date(post.publishOn).toISOString()} title={formatDateTime(post.publishOn)}>
          {formatDate(post.publishOn)}
        </time>
        {post.authors.length > 0 ? (
          <>
            {" by "}
            {post.authors.map((author, index) => (
              <span key={author.username}>
                {index > 0 ? ", " : ""}
                <RatingName
                  username={author.username}
                  rating={author.rating}
                  href={`/user/${author.username}`}
                  isAdmin={author.displayRank === "admin"}
                />
              </span>
            ))}
          </>
        ) : null}
        {post.visible ? null : <span className="ml-2 text-warning-ink">Draft</span>}
      </p>

      <div className="mt-3">{children}</div>

      <div className="mt-3 flex items-center gap-4 text-sm">
        {showContinue ? (
          <Link href={post.href} className="text-link">
            Continue reading…
          </Link>
        ) : null}
        <Link
          href={`${post.href}#comments`}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-subtle"
          aria-label={`${comments} ${comments === 1 ? "comment" : "comments"}`}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          <span className="font-mono tabular-nums">{comments}</span>
        </Link>
      </div>
    </article>
  );
}
