import { getTranslations } from "next-intl/server";
import { ErrorScreen } from "@/components/shell/ErrorScreen";

export async function generateMetadata() {
  const t = await getTranslations("common.error");

  return { title: t("accessDenied") };
}

export default async function Forbidden() {
  const t = await getTranslations("common.error");

  return <ErrorScreen code={403} id="AccessDenied" description={t("accessDenied")} />;
}
