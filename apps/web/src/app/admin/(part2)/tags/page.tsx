import { TitleRow } from "@moj/ui";
import { TagsTable } from "./TagsTable";

export const metadata = { title: "Contest tags" };

export default function AdminTagsPage() {
  return (
    <>
      <TitleRow title="Contest tags" />
      <TagsTable />
    </>
  );
}
