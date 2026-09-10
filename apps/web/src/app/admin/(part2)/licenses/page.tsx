import { TitleRow } from "@moj/ui";
import { LicensesTable } from "./LicensesTable";

export const metadata = { title: "Licenses" };

export default function AdminLicensesPage() {
  return (
    <>
      <TitleRow title="Licenses" />
      <LicensesTable />
    </>
  );
}
