import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  TitleRow,
} from "@moj/ui";
import { Info, MailCheck } from "lucide-react";
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
      <div id="content-body" className="grid max-w-(--prose-max) gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailCheck className="size-4 text-subtle" aria-hidden />
              Check your email
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-base text-subtle">
            <p>
              Your account has been created. We have sent an activation link to
              {email ? (
                <strong className="font-medium text-foreground"> {email}</strong>
              ) : (
                " your email address"
              )}
              ; follow it to finish signing up. The link is good for seven days.
            </p>
            <p>
              Nothing arrived? Check your spam folder, then <Link href="/accounts/register/">try again</Link>.
            </p>
          </CardContent>
        </Card>

        {link ? (
          <Alert variant="info">
            <Info className="size-3.5" aria-hidden />
            <AlertTitle>Mail is not configured on this install</AlertTitle>
            <AlertDescription>
              <a href={link.url} className="break-all font-mono text-mono">
                {link.url}
              </a>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </>
  );
}
