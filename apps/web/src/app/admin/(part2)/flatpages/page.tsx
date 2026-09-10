import { TitleRow } from "@moj/ui";
import { FlatPagesTable } from "./FlatPagesTable";

export const metadata = { title: "Flat pages" };

export default function AdminFlatPagesPage() {
  return (
    <>
      <TitleRow title="Flat pages" />
      <FlatPagesTable />
    </>
  );
}
