"use client";

import { api } from "@convex/_generated/api";
import { Button, Checkbox, Panel, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminFormError } from "@/components/admin";
import type { ContestEdit } from "./types";

/** Whether this contest wants its competitors on camera, so to speak. */
export function ContestProctorTab({ contest }: { contest: ContestEdit }) {
  const t = useTranslations("admin.contests.proctoring");
  const actions = useTranslations("common.actions");
  const update = useMutation(api.admin.contests.update);

  const [required, setRequired] = useState(contest.proctorRequired);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);

    try {
      await update({
        key: contest.key,
        proctorRequired: required,
        reason: "Changed the proctoring settings",
      });
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />

      <Panel title={t("title")} bodyClassName="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        <Checkbox checked={required} onCheckedChange={setRequired} label={t("required")} />
      </Panel>

      <div>
        <Button onClick={() => void save()} busy={busy}>
          {actions("save")}
        </Button>
      </div>
    </div>
  );
}
