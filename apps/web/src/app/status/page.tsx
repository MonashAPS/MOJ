import { TitleRow } from "@moj/ui";
import { StatusTable } from "./StatusTable";

export const metadata = { title: "Status" };

export default function StatusPage() {
  return (
    <>
      <TitleRow title="Status" />
      <div id="content-body">
        <StatusTable />
      </div>
    </>
  );
}
