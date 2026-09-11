"use client";

import { Alert, AlertDescription, AlertTitle, Spinner } from "@moj/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";

type State = "working" | "done" | "failed";

export function ActivateClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");
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
      <p className="flex items-center gap-2 text-base text-subtle">
        <Spinner aria-hidden />
        Activating your account…
      </p>
    );
  }

  if (state === "failed") {
    return (
      <div className="grid max-w-(--prose-max) gap-4">
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>This activation link is no longer valid.</AlertTitle>
          <AlertDescription>Activation links are good for seven days.</AlertDescription>
        </Alert>
        <p className="text-base text-subtle">
          If your account is already active, <Link href="/accounts/login/">log in</Link>. Otherwise{" "}
          <Link href="/accounts/register/">register again</Link>, or open a ticket if you think this is wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-(--prose-max) gap-4">
      <Alert variant="success">
        <CheckCircle2 className="size-3.5" aria-hidden />
        <AlertTitle>Your account is active.</AlertTitle>
      </Alert>
      <p className="text-base text-subtle">
        You are all set. <Link href="/accounts/login/">Log in</Link> and start solving, or head straight to
        the <Link href="/problems/">problem list</Link>.
      </p>
    </div>
  );
}
