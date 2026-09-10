import { TitleRow } from "@moj/ui";
import { TicketsTable } from "./TicketsTable";

export const metadata = { title: "Tickets" };

export default function AdminTicketsPage() {
  return (
    <>
      <TitleRow title="Tickets" />
      <TicketsTable />
    </>
  );
}
