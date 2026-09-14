import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewContestForm } from "./NewContestForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.contests.new");
  return { title: t("metaTitle") };
}

export default function NewContestPage() {
  return <NewContestForm />;
}
