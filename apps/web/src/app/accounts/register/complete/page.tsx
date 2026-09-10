import { TitleRow } from "@moj/ui";
import Link from "next/link";
import { recallLink } from "@/auth/mail";

export const metadata = { title: "Registration complete" };
export const dynamic = "force-dynamic";

export default async function RegistrationCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // Never in production: outside it, mail goes to the server console and the
  // link is surfaced here so a new install can be finished without a mail server.
  const link = process.env.NODE_ENV !== "production" && email ? recallLink(email) : undefined;

  return (
    <>
      <TitleRow title="Registration complete" />
      <div id="content-body">
        <div className="content-description" style={{ maxWidth: "45em" }}>
          <p>
            Your account has been created. We have sent an activation link to
            {email ? <strong> {email}</strong> : " your email address"}; follow it to finish signing up. The
            link is good for seven days.
          </p>
          <p>
            Nothing arrived? Check your spam folder, then <Link href="/accounts/register/">try again</Link>.
          </p>

          {link ? (
            <div className="alert alert-info">
              Mail is not configured on this install, so the activation link is shown here:
              <br />
              <a href={link.url} style={{ wordBreak: "break-all" }}>
                {link.url}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
