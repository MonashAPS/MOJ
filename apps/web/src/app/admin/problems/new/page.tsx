import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewProblemForm } from "./NewProblemForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.problems.new");
  return { title: t("metaTitle") };
}

export default function NewProblemPage() {
  return <NewProblemForm />;
}
