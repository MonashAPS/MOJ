"use client";

import { Alert, AlertDescription, AlertTitle, Spinner } from "@moj/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";

type State = "working" | "done" | "failed";

export function ActivateClient({ token }: { token: string }) {
  const t = useTranslations("auth.activate");
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
        {t("working")}
      </p>
    );
  }

  if (state === "failed") {
    return (
      <div className="grid max-w-(--prose-max) gap-4">
        <Alert variant="danger">
          <AlertCircle className="size-3.5" aria-hidden />
          <AlertTitle>{t("invalidTitle")}</AlertTitle>
          <AlertDescription>{t("invalidDescription")}</AlertDescription>
        </Alert>
        <p className="text-base text-subtle">
          {t.rich("invalidHelp", {
            login: (chunks) => <Link href="/accounts/login/">{chunks}</Link>,
            register: (chunks) => <Link href="/accounts/register/">{chunks}</Link>,
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-(--prose-max) gap-4">
      <Alert variant="success">
        <CheckCircle2 className="size-3.5" aria-hidden />
        <AlertTitle>{t("doneTitle")}</AlertTitle>
      </Alert>
      <p className="text-base text-subtle">
        {t.rich("doneHelp", {
          login: (chunks) => <Link href="/accounts/login/">{chunks}</Link>,
          problems: (chunks) => <Link href="/problems/">{chunks}</Link>,
        })}
      </p>
    </div>
  );
}
