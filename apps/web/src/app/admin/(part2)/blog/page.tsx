import { api } from "@convex/_generated/api";
import { TitleRow } from "@moj/ui";
import { queryAsViewer } from "@/lib/convex-server";
import { BlogTable } from "./BlogTable";

export const metadata = { title: "Blog" };

export default async function AdminBlogPage() {
  /** The author picker needs profile ids; only `judge.change_profile` may list
   *  them, so a post editor without it gets the picker disabled rather than an
   *  error. */
  const staff = await queryAsViewer(api.admin.users.list, { isStaff: true, perPage: 200 }).catch(() => null);

  return (
    <>
      <TitleRow title="Blog" />
      <BlogTable
        authorOptions={
          staff?.users.map((user) => ({ id: user._id as string, label: user.displayName })) ?? null
        }
      />
    </>
  );
}
