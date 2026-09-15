import { getTranslations } from "next-intl/server";
import { ErrorScreen } from "@/components/shell/ErrorScreen";

export async function generateMetadata() {
  const t = await getTranslations("common.error");
  return { title: t("notFound") };
}

export default async function NotFound() {
  const t = await getTranslations("common.error");
  return <ErrorScreen code={404} id="PageNotFound" description={t("notFound")} />;
}
