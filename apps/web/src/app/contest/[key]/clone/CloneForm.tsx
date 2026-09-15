"use client";

import type { ContestDetail } from "@convex/contests";
import { Button, Field, FormFooter, Input, Panel, TitleRow } from "@moj/ui";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { cloneContest } from "@/app/contest/actions";
import { ContestChips } from "@/components/contests/pieces";
import { contestTabs } from "../tabs";

/** `contest/clone.html`: one field, one button, and the clone opens hidden with
 *  the cloner as its only author. */
export function CloneForm({ contestKey, detail }: { contestKey: string; detail: ContestDetail }) {
  const [state, formAction, pending] = useActionState(cloneContest, null);
  const t = useTranslations("contests.clone");
  const tabLabels = useTranslations("contests.tabs");
  const contest = detail.contest;

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? t("metaFallback")}
            {contest ? (
              <ContestChips
                isVisible={contest.isVisible}
                isPrivate={contest.isPrivate}
                isOrganizationPrivate={contest.isOrganizationPrivate}
                isRated={contest.isRated}
                organizations={contest.organizations}
                tags={contest.tags}
              />
            ) : null}
          </span>
        }
        tabs={contestTabs(detail, contestKey, tabLabels)}
        active="clone"
      />

      <div className="mx-auto w-full max-w-[520px]">
        <Panel title={t("panelTitle")} bodyClassName="p-4">
          <form action={formAction} className="grid gap-4">
            <input type="hidden" name="key" value={contestKey} />
            <Field label={t("newKeyLabel")} htmlFor="newKey" hint={t("newKeyHint")} error={state?.error}>
              <Input
                id="newKey"
                name="newKey"
                mono
                required
                maxLength={20}
                pattern="[a-z0-9]+"
                autoComplete="off"
                invalid={!!state?.error}
                placeholder={`${contestKey}copy`}
              />
            </Field>
            <FormFooter>
              <Button type="submit" busy={pending}>
                {t("submit")}
              </Button>
            </FormFooter>
          </form>
        </Panel>
      </div>
    </>
  );
}
