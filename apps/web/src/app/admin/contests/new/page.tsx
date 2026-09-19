import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewContestWizard } from "./NewContestWizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.contests.new");

  return { title: t("metaTitle") };
}

export default function NewContestPage() {
  return <NewContestWizard />;
}
