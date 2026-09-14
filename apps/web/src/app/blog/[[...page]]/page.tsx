import { api } from "@convex/_generated/api";
import { ContentDescription, Pagination, TitleRow, TwoColumn } from "@moj/ui";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PostCard } from "@/components/blog/PostCard";
import { ContestsBox, NewProblemsBox, RecentCommentsBox, TopUsersBox } from "@/components/home/SideBoxes";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

/** `PostList.paginate_by` (judge/views/blog.py:20). */
const PER_PAGE = 10;

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ page?: string[] }> };

function pageNumber(segments: string[] | undefined): number {
  if (!segments || segments.length === 0) return 1;
  if (segments.length > 1) notFound();
  const parsed = Number(segments[0]);
  if (!Number.isInteger(parsed) || parsed < 1) notFound();
  return parsed;
}

export async function generateMetadata({ params }: Props) {
  const page = pageNumber((await params).page);
  const t = await getTranslations("blog.meta");
  return { title: page === 1 ? t("news") : t("newsPage", { page }) };
}

export default async function BlogListPage({ params }: Props) {
  const t = await getTranslations("blog.list");
  const page = pageNumber((await params).page);
  const result = await queryAsViewer(api.blog.paginated, {
    paginationOpts: { numItems: PER_PAGE, cursor: String((page - 1) * PER_PAGE) },
  }).catch(() => null);

  const posts = result?.page ?? [];
  const total = result?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > totalPages && page !== 1) notFound();

  // `renderMarkdown` is async and JSX is not, so every summary is rendered here.
  const summaries = new Map(
    await Promise.all(
      posts.map(
        async (post) =>
          [post._id, await renderContent(post.summary || post.content, post.contentPreset)] as const,
      ),
    ),
  );

  return (
    <>
      <TitleRow title={t("title")} />
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
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="grid gap-4">
              {posts.map((post) => (
                <PostCard key={post._id} post={post} showContinue={post.summary.trim().length > 0}>
                  <ContentDescription html={summaries.get(post._id) ?? ""} />
                </PostCard>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              hrefFor={(target) => (target === 1 ? "/blog/" : `/blog/${target}/`)}
              className="mt-6"
            />
          ) : null}
        </TwoColumn>
      </div>
    </>
  );
}
