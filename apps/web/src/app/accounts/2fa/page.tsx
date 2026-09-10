import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  TitleRow,
} from "@moj/ui";
import { AlertCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Two factor authentication" };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; required?: string }>;
}) {
  const { required } = await searchParams;
  return (
    <>
      <TitleRow title="Two factor authentication" />
      <div id="content-body" className="grid max-w-(--prose-max) gap-4">
        {required ? (
          <Alert variant="warning">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>Staff accounts must have two factor authentication enabled.</AlertTitle>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-subtle" aria-hidden />
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-base text-subtle">
            <p>
              Two factor authentication adds a second step to logging in: your password, then a six digit code
              from an authenticator app on your phone.
            </p>
            <p>Scratch codes let you back in if you lose the phone. Keep them somewhere safe.</p>
          </CardContent>
          <CardFooter className="border-t">
            <Button asChild variant="secondary">
              <Link href="/edit/profile/">Back to your profile</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
