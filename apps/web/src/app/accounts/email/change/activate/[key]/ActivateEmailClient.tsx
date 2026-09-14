"use client";

import { Alert, AlertDescription, AlertTitle, Button, Spinner } from "@moj/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";
import { AuthCard } from "@/components/auth/AuthCard";

/** DMOJ's `EmailChangeActivateView`. The token is Better Auth's, so the change
 *  itself is applied by the verify-email endpoint. */
export function ActivateEmailClient({ token }: { token: string }) {
  const t = useTranslations("auth.emailChangeActivate");
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
      <AuthCard title={t("workingTitle")} subtitle={t("workingSubtitle")}>
        <p className="flex items-center gap-2 text-base text-subtle">
          <Spinner aria-hidden />
          {t("working")}
        </p>
      </AuthCard>
    );
  }

  if (state === "failed") {
    return (
      <AuthCard
        title={t("failedTitle")}
        subtitle={t("failedSubtitle")}
        footer={
          <span>{t.rich("footer", { link: (chunks) => <Link href="/edit/profile/">{chunks}</Link> })}</span>
        }
      >
        <div className="grid gap-4">
          <Alert variant="danger">
            <AlertCircle className="size-3.5" aria-hidden />
            <AlertTitle>{t("failedAlertTitle")}</AlertTitle>
            <AlertDescription>{t("failedAlertDescription")}</AlertDescription>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/email/change/">{t("tryAgain")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("doneTitle")}
      subtitle={t("doneSubtitle")}
      footer={
        <span>{t.rich("footer", { link: (chunks) => <Link href="/edit/profile/">{chunks}</Link> })}</span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>{t("doneAlert")}</AlertTitle>
        </Alert>
        <Button asChild full>
          <Link href="/edit/profile/">{t("backToProfile")}</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
