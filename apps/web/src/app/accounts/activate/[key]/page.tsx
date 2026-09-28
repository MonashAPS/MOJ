import { getTranslations } from "next-intl/server";
import { TitleRow } from "@/components/shell/PageTabs";
import { ActivateClient } from "./ActivateClient";

export async function generateMetadata() {
  const t = await getTranslations("auth.activate");

  return { title: t("metaTitle") };
}

export default async function ActivatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const t = await getTranslations("auth.activate");

  return (
    <>
      <TitleRow title={t("title")} />
      <div id="content-body">
        <ActivateClient token={key} />
      </div>
    </>
  );
}
