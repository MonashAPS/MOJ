import { TitleRow } from "@moj/ui";
import { LanguagesTable } from "./LanguagesTable";

export const metadata = { title: "Languages" };

export default function AdminLanguagesPage() {
  return (
    <>
      <TitleRow title="Languages" />
      <LanguagesTable />
    </>
  );
}
