"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, FormFooter, Input, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

/** `RequestJoinClass`, plus the access-code path: a tutor hands the code out in
 *  a lab and the member joins on the spot. */
export function JoinClassForm({
  organizationSlug,
  classSlug,
  name,
  backHref,
  requiresAccessCode,
}: {
  organizationSlug: string;
  classSlug: string;
  name: string;
  backHref: string;
  requiresAccessCode: boolean;
}) {
  const t = useTranslations("organizations.class");
  const shared = useTranslations("organizations.common");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const join = useMutation(api.classes.join);
  const codeId = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);

    try {
      await join({ organizationSlug, classSlug, accessCode: code || undefined });
      toast.success(t("joinedClass", { name }));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-[36rem] gap-4">
      <Panel title={t("joinTitle", { name })} bodyClassName="grid gap-4 p-4">
        {requiresAccessCode ? (
          <Field label={t("accessCode")} htmlFor={codeId} hint={t("accessCodeHint")}>
            <Input
              id={codeId}
              mono
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
        ) : (
          <p className="text-base text-subtle">{t("noAccessCode", { name })}</p>
        )}
      </Panel>
      <FormFooter>
        <Button variant="secondary" asChild>
          <a href={backHref}>{actions("cancel")}</a>
        </Button>
        <Button
          busy={busy}
          disabled={!requiresAccessCode || !code}
          title={
            requiresAccessCode ? (code ? undefined : t("enterAccessCode")) : t("noAccessCodeTitle", { name })
          }
          onClick={submit}
        >
          {t("join")}
        </Button>
      </FormFooter>
    </div>
  );
}
