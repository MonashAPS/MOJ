import { api } from "@convex/_generated/api";
import { Button, ContentDescription, RatingName, TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Comments } from "@/components/comments/Comments";
import { queryAsViewer } from "@/lib/convex-server";
import { formatDateTime } from "@/lib/format";
import { renderContent } from "@/lib/markdown";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** DMOJ's `/post/<int:id>-<slug>`: the id is authoritative, the slug decorative. */
function postId(slug: string): string {
  const dash = slug.indexOf("-");

  return dash === -1 ? slug : slug.slice(0, dash);
}

async function load(slug: string) {
  return await queryAsViewer(api.blog.get, { id: postId(slug) }).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await load((await params).slug);

  if (!post) {
    const t = await getTranslations("common.states");

    return { title: t("notFound") };
  }

  const description = post.metaDescription.replace(/\s+/g, " ").trim().slice(0, 200);

  return {
    title: post.title,
    description,
    openGraph: {
      title: post.title,
      description,
      images: post.ogImage ? [post.ogImage] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const [t, common] = await Promise.all([getTranslations("blog.post"), getTranslations("common.actions")]);
  const post = await load((await params).slug);

  if (!post) notFound();

  const html = await renderContent(post.content, post.contentPreset);

  return (
    <>
      <TitleRow
        title={post.title}
        action={
          post.canEdit ? (
            <Button asChild variant="secondary">
              <Link href={`/admin/blog/${post._id}/`}>{common("edit")}</Link>
            </Button>
          ) : null
        }
      />
      <div id="content-body">
        <article className="post-full">
          <p className="mb-4 text-sm text-muted-foreground">
            {post.authorProfiles.length > 0 ? (
              <>
                {post.authorProfiles.map((author, index) => (
                  <span key={author.username}>
                    {index > 0 ? ", " : ""}
                    <RatingName
                      username={author.username}
                      displayName={author.displayName}
                      rating={author.rating}
                      href={`/user/${author.username}`}
                      isAdmin={author.displayRank === "admin"}
                    />
                  </span>
                ))}
                {" · "}
              </>
            ) : null}
            {t.rich("postedOn", {
              time: () => (
                <time dateTime={new Date(post.publishOn).toISOString()}>
                  {formatDateTime(post.publishOn)}
                </time>
              ),
            })}
          </p>

          <ContentDescription html={html} />
        </article>

        <Comments targetType="blog" targetKey={post._id} />
      </div>
    </>
  );
}
