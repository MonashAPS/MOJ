import { api } from "@convex/_generated/api";
import { renderMarkdown } from "@moj/content";
import { ContentDescription, RatingName, TitleRow, TwoColumn } from "@moj/ui";
import { MessageSquare, Pin } from "lucide-react";
import Link from "next/link";
import { ContestsBox, NewProblemsBox, RecentCommentsBox, TopUsersBox } from "@/components/home/SideBoxes";
import { query, queryAsViewer } from "@/lib/convex-server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [misc, posts] = await Promise.all([
    query(api.site.miscConfig, {}).catch(() => ({}) as Record<string, string>),
    queryAsViewer(api.blog.list, { limit: 10 }).catch(() => []),
  ]);
  // The summaries are rendered here rather than in the map below so the page
  // stays a single await; `renderMarkdown` is async, JSX is not.
  const summaries = new Map(
    await Promise.all(
      posts.map(
        async (post) =>
          [
            post._id,
            (await renderMarkdown(post.summary || firstParagraph(post.content), "blog")).html,
          ] as const,
      ),
    ),
  );

  return (
    <>
      <TitleRow title="News" />
      <div id="content-body">
        <TwoColumn
          side={
            <>
              <ContestsBox />
              <RecentCommentsBox />
              <NewProblemsBox />
              <TopUsersBox />
            </>
          }
        >
          {misc.home_page_top ? (
            <div
              className="content-description"
              style={{ marginBottom: "1.5em" }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: misc config, staff authored
              dangerouslySetInnerHTML={{ __html: misc.home_page_top }}
            />
          ) : null}

          {posts.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>There are no announcements yet.</p>
          ) : (
            posts.map((post) => (
              <article
                key={post._id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg)",
                  padding: "12px 16px 14px",
                  marginBottom: "14px",
                }}
              >
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {post.sticky ? (
                    <Pin size={15} aria-label="Pinned" style={{ color: "var(--accent)", flex: "none" }} />
                  ) : null}
                  <Link href={post.href}>{post.title}</Link>
                </h3>

                <p style={{ color: "var(--muted)", margin: "4px 0 10px", fontSize: "0.95em" }}>
                  posted on{" "}
                  <time dateTime={new Date(post.publishOn).toISOString()}>{formatDate(post.publishOn)}</time>
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
                </p>

                <ContentDescription html={summaries.get(post._id) ?? ""} />

                <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: "0.95em" }}>
                  <Link href={post.href}>read more</Link>
                  <Link
                    href={`${post.href}#comments`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted)" }}
                  >
                    <MessageSquare size={14} aria-hidden />
                    {post.commentCount}
                  </Link>
                </div>
              </article>
            ))
          )}
        </TwoColumn>
      </div>
    </>
  );
}

function firstParagraph(content: string): string {
  const paragraph = content.split(/\n\s*\n/)[0] ?? "";
  return paragraph.length > 400 ? `${paragraph.slice(0, 400)}...` : paragraph;
}
