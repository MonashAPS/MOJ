import { ActivateEmailClient } from "./ActivateEmailClient";

export const metadata = { title: "Confirm your new email" };

export default async function EmailChangeActivatePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <ActivateEmailClient token={key} />;
}
