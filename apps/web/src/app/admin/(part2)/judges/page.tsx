import { TitleRow } from "@moj/ui";
import { JudgesTable } from "./JudgesTable";

export const metadata = { title: "Judges" };

export default function AdminJudgesPage() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return (
    <>
      <TitleRow title="Judges" />
      <JudgesTable siteUrl={siteUrl} />
    </>
  );
}
