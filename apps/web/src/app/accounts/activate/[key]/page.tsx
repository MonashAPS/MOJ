import { TitleRow } from "@moj/ui";
import { getTranslations } from "next-intl/server";
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
