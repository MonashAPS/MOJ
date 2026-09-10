import { TitleRow } from "@moj/ui";
import { OrganizationsTable } from "./OrganizationsTable";

export const metadata = { title: "Organizations" };

export default function AdminOrganizationsPage() {
  return (
    <>
      <TitleRow title="Organizations" />
      <OrganizationsTable />
    </>
  );
}
