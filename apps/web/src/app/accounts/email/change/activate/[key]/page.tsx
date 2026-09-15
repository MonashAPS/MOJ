import { getTranslations } from "next-intl/server";
import { ActivateEmailClient } from "./ActivateEmailClient";

export async function generateMetadata() {
  const t = await getTranslations("auth.emailChangeActivate");

  return { title: t("metaTitle") };
}

export default async function EmailChangeActivatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  return <ActivateEmailClient token={key} />;
}
