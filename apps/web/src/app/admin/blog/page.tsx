import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { BlogTable } from "./BlogTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.blog");

  return { title: t("metaTitle") };
}

export default async function AdminBlogPage() {
  const t = await getTranslations("admin.blog");

  /** The author picker needs profile ids; only `judge.change_profile` may list
   *  them, so a post editor without it gets the picker disabled rather than an
   *  error. */
  const staff = await queryAsViewer(api.admin.users.list, { isStaff: true, perPage: 200 }).catch(() => null);

  return (
    <>
      <TitleRow title={t("title")} />
      <BlogTable
        authorOptions={staff?.users.map((user) => ({ id: user._id, label: user.displayName })) ?? null}
      />
    </>
  );
}
