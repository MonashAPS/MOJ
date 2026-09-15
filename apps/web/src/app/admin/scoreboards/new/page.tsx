import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScoreboardForm } from "../ScoreboardForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.scoreboards");

  return { title: t("newMetaTitle") };
}

export default function NewScoreboardPage() {
  return <ScoreboardForm />;
}
