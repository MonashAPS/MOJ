"use client";

import { Button, FormFooter, Panel, TitleRow } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { leaveContest } from "@/app/contest/actions";
import { joinErrorOf } from "@/lib/join-result";

export function LeavePanel({
  contestKey,
  contestName,
  spectating,
}: {
  contestKey: string;
  contestName: string;
  spectating: boolean;
}) {
  const [state, formAction, pending] = useActionState(leaveContest, null);
  const t = useTranslations("contests.leave");

  return (
    <>
      <TitleRow
        title={
          spectating
            ? t("stopSpectatingTitle", { name: contestName })
            : t("leaveTitle", { name: contestName })
        }
      />
      <div className="mx-auto w-full max-w-[520px]">
        <Panel title={t("confirmPanel")} bodyClassName="p-4">
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="key" value={contestKey} />
            <p className="text-base text-subtle">{spectating ? t("spectatingBody") : t("leaveBody")}</p>
            {joinErrorOf(state) ? <p className="text-sm text-bad">{joinErrorOf(state)}</p> : null}
            <FormFooter
              note={
                <Link href={`/contest/${contestKey}/`} className="text-muted-foreground hover:text-subtle">
                  {t("backToContest")}
                </Link>
              }
            >
              <Button type="submit" variant="secondary" busy={pending}>
                {spectating ? t("stopSpectating") : t("leave")}
              </Button>
            </FormFooter>
          </form>
        </Panel>
      </div>
    </>
  );
}
