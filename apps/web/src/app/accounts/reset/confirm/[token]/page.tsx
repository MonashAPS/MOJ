import { ResetConfirmForm } from "./ResetConfirmForm";

export const metadata = { title: "Set a new password" };

export default async function ResetConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetConfirmForm token={token} />;
}
