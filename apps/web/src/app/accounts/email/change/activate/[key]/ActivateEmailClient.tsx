"use client";

import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@moj/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `EmailChangeActivateView`. The token is Better Auth's, so the change
 *  itself is applied by the verify-email endpoint. */
export function ActivateEmailClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const result = await authClient.verifyEmail({ query: { token } });
      if (result.error) {
        setState("failed");
        return;
      }
      setState("done");
      router.refresh();
    })();
  }, [token, router]);

  if (state === "working") {
    return (
      <AuthCard title="Changing your email" subtitle="One moment.">
        <p className="flex items-center gap-2 text-base text-subtle">
          <Spinner aria-hidden />
          Confirming the change…
        </p>
      </AuthCard>
    );
  }

  if (state === "failed") {
    return (
      <AuthCard
        title="Email change failed"
        subtitle="Nothing has changed on your account."
        footer={
          <span>
            Back to <Link href="/edit/profile/">your profile</Link>
          </span>
        }
      >
        <div className="grid gap-4">
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>This link is no longer valid.</AlertTitle>
            <AlertDescription>
              It may have expired, been used already, or the address may have been taken by somebody else in
              the meantime. Open the link while logged in to the account that asked for the change.
            </AlertDescription>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/email/change/">Try again</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Email changed"
      subtitle="Your account now uses the new address."
      footer={
        <span>
          Back to <Link href="/edit/profile/">your profile</Link>
        </span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>The email attached to your account has been changed.</AlertTitle>
        </Alert>
        <Button asChild full>
          <Link href="/edit/profile/">Back to your profile</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
