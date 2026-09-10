import { TitleRow } from "@moj/ui";
import { ActivateClient } from "./ActivateClient";

export const metadata = { title: "Activate account" };

export default async function ActivatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <>
      <TitleRow title="Activate your account" />
      <div id="content-body">
        <ActivateClient token={key} />
      </div>
    </>
  );
}
