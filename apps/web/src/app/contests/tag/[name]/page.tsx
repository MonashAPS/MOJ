import { api } from "@convex/_generated/api";
import { EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TitleRow } from "@moj/ui";
import { Tag } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ContestWindow, tagInk, UserCount } from "@/components/contests/pieces";
import { queryAsViewer } from "@/lib/convex-server";
import { renderContent } from "@/lib/markdown";

const LIST_ARGS = {
  paginationOpts: { numItems: 100, cursor: "0" },
  sort: "startTime",
  descending: true,
};

async function loadTag(name: string) {
  const [tag, list] = await Promise.all([
    queryAsViewer(api.pages.contests.tag, { name }).catch(() => null),
    queryAsViewer(api.contests.list, { ...LIST_ARGS, tagName: name }).catch(() => null),
  ]);

  const contests = list ? [...list.current, ...list.future, ...list.past.page] : [];
  // Without the (new) tag query, the tag's own colour and description still come
  // out of the contests carrying it.
  const fallback = contests.flatMap((contest) => contest.tags).find((row) => row.name === name);
  const resolved = tag ?? (fallback ? { ...fallback, textColor: tagInk(fallback.color) } : null);
  return { tag: resolved, contests, found: !!tag || !!fallback };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return { title: `Contest tag: ${name}` };
}

export default async function ContestTagPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { tag, contests, found } = await loadTag(name);
  if (!found || !tag) notFound();

  const descriptionHtml = tag.description ? await renderContent(tag.description, "contest-tag") : "";

  return (
    <>
      <TitleRow
        title={
          <span
            style={{ backgroundColor: tag.color, color: tag.textColor }}
            className="inline-flex h-8 items-center rounded-full px-4 font-mono text-h3 font-semibold"
          >
            {tag.name}
          </span>
        }
      />

      {descriptionHtml ? (
        <div
          className="content-description mb-6"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by @moj/content
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      ) : null}

      {contests.length === 0 ? (
        <EmptyState
          icon={<Tag aria-hidden />}
          title="Nothing tagged"
          description={`No contests carry the "${tag.name}" tag.`}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-full">Contest</TableHead>
              <TableHead numeric>Users</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contests.map((contest) => (
              <TableRow key={contest._id}>
                <TableCell className="relative py-2 align-top">
                  <div className="grid gap-1">
                    <Link
                      href={`/contest/${contest.key}/`}
                      className="font-medium text-foreground before:absolute before:inset-0 hover:text-link"
                    >
                      {contest.name}
                    </Link>
                    <ContestWindow
                      startTime={contest.startTime}
                      endTime={contest.endTime}
                      timeLimit={contest.timeLimit}
                    />
                  </div>
                </TableCell>
                <TableCell numeric className="align-top">
                  <UserCount count={contest.userCount} href={`/contest/${contest.key}/ranking/`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
