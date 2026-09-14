"use client";

import { api } from "@convex/_generated/api";
import { Button, Field, FormFooter, Panel, Select, Textarea, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useId, useState } from "react";

export type ClassOption = { value: string; label: string };

/** `organization/requests/request.html` and `RequestJoinOrganization`. Ctrl+Enter
 *  submits, as DMOJ's form does. */
export function RequestJoinForm({
  slug,
  name,
  backHref,
  classes,
  classRequired,
}: {
  slug: string;
  name: string;
  backHref: string;
  classes: ClassOption[];
  classRequired: boolean;
}) {
  const t = useTranslations("organizations.request");
  const shared = useTranslations("organizations.common");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const request = useMutation(api.organizations.request);
  const reasonId = useId();
  const classId = useId();

  const [reason, setReason] = useState("");
  const [classSlug, setClassSlug] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const missingClass = classRequired && !classSlug;

  async function submit() {
    setBusy(true);
    try {
      await request({ slug, reason, classSlug });
      toast.success(t("sent", { organization: name }));
      router.push(backHref);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : shared("failed"));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.ctrlKey && event.key === "Enter" && reason.trim() && !missingClass) submit();
  }

  return (
    <div className="grid max-w-[44rem] gap-4">
      <Panel title={t("panel")} bodyClassName="grid gap-4 p-4">
        {classes.length > 0 ? (
          <Field
            label={t("class")}
            htmlFor={classId}
            optional={classRequired ? undefined : t("optional")}
            error={missingClass ? t("classRequired") : undefined}
          >
            <Select
              id={classId}
              options={classes}
              value={classSlug}
              onValueChange={setClassSlug}
              placeholder={t("classPlaceholder")}
              invalid={missingClass}
            />
          </Field>
        ) : null}
        <Field label={t("reason")} htmlFor={reasonId} hint={t("reasonHint")}>
          <Textarea
            id={reasonId}
            rows={6}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </Field>
      </Panel>
      <FormFooter>
        <Button variant="secondary" asChild>
          <a href={backHref}>{actions("cancel")}</a>
        </Button>
        <Button
          busy={busy}
          disabled={!reason.trim() || missingClass}
          title={missingClass ? t("pickClass") : reason.trim() ? undefined : t("giveReason")}
          onClick={submit}
        >
          {t("submit")}
        </Button>
      </FormFooter>
    </div>
  );
}
