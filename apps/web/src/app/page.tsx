import { api } from "@convex/_generated/api";
import { Button, cn, EmptyState, RatingName, TitleRow, TwoColumn } from "@moj/ui";
import { ArrowRight, MessageSquare, Newspaper, Pin, Rss } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { HomeTopSlot } from "@/components/home/HomeTopSlot";
import { ContestsBox, NewProblemsBox, RecentCommentsBox, TopUsersBox } from "@/components/home/SideBoxes";
import { query, queryAsViewer } from "@/lib/convex-server";
import { formatDate, formatRelative } from "@/lib/format";
import { renderContent } from "@/lib/markdown";

export async function generateMetadata() {
  const t = await getTranslations("common.nav");

  return { title: t("home") };
}

export const dynamic = "force-dynamic";

const DAY = 24 * 3600_000;

export default async function HomePage() {
  const t = await getTranslations("common.home");

  const [misc, posts, session] = await Promise.all([
    query(api.site.miscConfig, {}).catch((): Record<string, string> => ({})),
    queryAsViewer(api.blog.list, { limit: 10 }).catch(() => []),
    getServerSession().catch(() => null),
  ]);

  const topSlot = misc.home_page_top?.trim()
    ? await renderContent(misc.home_page_top, "flatpage").catch(() => "")
    : "";

  // An expanded post is read on the home page itself; the rest show their summary.
  const bodies = await Promise.all(
    posts.map((post) =>
      renderContent(
        post.expanded ? post.content : post.summary || firstParagraph(post.content),
        "blog",
      ).catch(() => ""),
    ),
  );

  return (
    <>
      <TitleRow
        title={t("news")}
        action={
          <>
            <Button asChild variant="ghost" size="sm" icon={<Rss aria-hidden />}>
              <a href="/feed/blog/rss/">RSS</a>
            </Button>
            <Button asChild variant="ghost" size="sm" icon={<Rss aria-hidden />}>
              <a href="/feed/blog/atom/">Atom</a>
            </Button>
          </>
        }
      />

      <TwoColumn
        side={
          <>
            <ContestsBox />
            <RecentCommentsBox />
            <NewProblemsBox />
            <TopUsersBox viewerUsername={session?.user.name} />
          </>
        }
      >
        {topSlot ? <HomeTopSlot html={topSlot} /> : null}

        {posts.length === 0 ? (
          <EmptyState
            icon={<Newspaper aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <div className="grid gap-4">
            {posts.map((post, index) => (
              <article
                key={post._id}
                className={cn(
                  "enter-rise group rounded-md border border-border bg-card px-5 py-4",
                  "transition-colors duration-(--dur-fast) hover:border-border-strong",
                  post.sticky && "border-l-[3px] border-l-royal",
                )}
                style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}
              >
                <h2 className="flex items-start gap-2">
                  {post.sticky ? (
                    <Pin size={14} aria-label={t("pinned")} className="mt-1.5 shrink-0 text-royal" />
                  ) : null}
                  <Link
                    href={post.href}
                    className="font-display text-h2 font-semibold tracking-tight text-foreground transition-colors duration-(--dur-fast) group-hover:text-link"
                  >
                    {post.title}
                  </Link>
                </h2>

                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  {post.authors.map((author, authorIndex) => (
                    <span key={author.username}>
                      {authorIndex > 0 ? <span className="mr-1">,</span> : null}
                      <RatingName
                        username={author.username}
                        rating={author.rating}
                        href={`/user/${author.username}`}
                        isAdmin={author.displayRank === "admin"}
                      />
                    </span>
                  ))}
                  {post.authors.length > 0 ? <span aria-hidden>·</span> : null}
                  <time
                    dateTime={new Date(post.publishOn).toISOString()}
                    title={new Date(post.publishOn).toString()}
                    className="font-mono tabular-nums"
                  >
                    {Date.now() - post.publishOn < DAY
                      ? formatRelative(post.publishOn)
                      : formatDate(post.publishOn)}
                  </time>
                  <span aria-hidden>·</span>
                  <span>{t("comments", { count: post.commentCount })}</span>
                </p>

                {bodies[index] ? (
                  <div
                    // `--content-ink` is @moj/content's own knob for the prose colour;
                    // a summary is secondary text, while an expanded post is body copy.
                    // SAFETY: `CSSProperties` carries no index signature for custom properties,
                    // and the browser applies every `--*` entry of a style object as one.
                    style={
                      post.expanded ? undefined : ({ "--content-ink": "var(--ink-2)" } as React.CSSProperties)
                    }
                    className="content-description mt-3 max-w-[68ch] text-base"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by @moj/content
                    dangerouslySetInnerHTML={{ __html: bodies[index] }}
                  />
                ) : null}

                <div className="mt-4 flex items-center gap-4">
                  {post.expanded ? null : (
                    <Link
                      href={post.href}
                      className={cn(
                        "inline-flex h-(--control-h-sm) items-center gap-2 rounded-full border border-primary-line px-4",
                        "text-sm text-primary transition-colors hover:bg-primary-soft",
                        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/45",
                      )}
                    >
                      {t("readMore")}
                      <ArrowRight
                        size={14}
                        aria-hidden
                        className="transition-transform duration-(--dur) group-hover:translate-x-0.5"
                      />
                    </Link>
                  )}
                  <Link
                    href={`${post.href}#comments`}
                    className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-subtle"
                  >
                    <MessageSquare size={14} aria-hidden />
                    <span className="font-mono tabular-nums">{post.commentCount}</span>
                    <span className="sr-only">{t("comments", { count: post.commentCount })}</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </TwoColumn>
    </>
  );
}

function firstParagraph(content: string): string {
  const paragraph = content.split(/\n\s*\n/)[0] ?? "";

  return paragraph.length > 280 ? `${paragraph.slice(0, 280)}…` : paragraph;
}
