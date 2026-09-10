import { TitleRow } from "@moj/ui";
import Link from "next/link";

export const metadata = { title: "Two Factor Authentication" };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; required?: string }>;
}) {
  const { required } = await searchParams;
  return (
    <>
      <TitleRow title="Two Factor Authentication" />
      <div id="content-body">
        <div className="content-description" style={{ maxWidth: "45em" }}>
          {required ? (
            <div className="alert alert-warning">
              Staff accounts must have two factor authentication enabled.
            </div>
          ) : null}
          <p>
            Two factor authentication adds a second step to logging in: your password, then a six digit code
            from an authenticator app on your phone. Scratch codes let you back in if you lose the phone.
          </p>
          <p>
            <Link href="/edit/profile/">Back to your profile</Link>
          </p>
        </div>
      </div>
    </>
  );
}
