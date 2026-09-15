"use client";

import { Alert, AlertTitle, Button, Spinner } from "@moj/ui";
import { AlertCircle, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `webauthn_assert`: the browser is asked for a credential and the
 *  result finishes the sign-in. Better Auth does the challenge and the
 *  verification in one client call. */
export function AssertClient({ next }: { next: string }) {
  const t = useTranslations("auth.twoFactor.passkeys");
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "failed">("waiting");
  const started = useRef(false);

  const assert = useCallback(async () => {
    setState("waiting");

    try {
      const result = await authClient.signIn.passkey();

      if (result?.error) {
        setState("failed");

        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setState("failed");
    }
  }, [next, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void assert();
  }, [assert]);

  return (
    <AuthCard
      title={t("assertTitle")}
      subtitle={t("assertSubtitle")}
      footer={
        <span>
          {t.rich("assertFooter", {
            link: (chunks) => (
              <Link href={`/accounts/login/2fa/?next=${encodeURIComponent(next)}`}>{chunks}</Link>
            ),
          })}
        </span>
      }
    >
      {state === "waiting" ? (
        <p className="flex items-center gap-2 text-base text-subtle">
          <Spinner aria-hidden />
          {t("assertWaiting")}
        </p>
      ) : (
        <div className="grid gap-4">
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("assertRefused")}</AlertTitle>
          </Alert>
          <Button full icon={<Fingerprint aria-hidden />} onClick={() => void assert()}>
            {t("assertRetry")}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
