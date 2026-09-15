import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ScoreboardsList } from "./ScoreboardsList";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.scoreboards");

  return { title: t("metaTitle") };
}

export default function AdminScoreboardsPage() {
  return <ScoreboardsList />;
}
