"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  UserPicker,
} from "@/components/admin";
import type { ContestEdit } from "./types";

/** DMOJ's first fieldset plus the two "who may look" lists from Access. */
export function ContestPeopleTab({ contest }: { contest: ContestEdit }) {
  const t = useTranslations("admin.contests.people");
  const update = useMutation(api.admin.contests.update);
  const ids = {
    authors: useId(),
    curators: useId(),
    testers: useId(),
    spectators: useId(),
    scoreboard: useId(),
    submissions: useId(),
  };

  const [authors, setAuthors] = useState<string[]>(contest.authors);
  const [curators, setCurators] = useState<string[]>(contest.curators);
  const [testers, setTesters] = useState<string[]>(contest.testers);
  const [spectators, setSpectators] = useState<string[]>(contest.spectators);
  const [viewScoreboard, setViewScoreboard] = useState<string[]>(contest.viewContestScoreboard);
  const [viewSubmissions, setViewSubmissions] = useState<string[]>(contest.viewContestSubmissions);
  const [testerSeeScoreboard, setTesterSeeScoreboard] = useState(contest.testerSeeScoreboard);
  const [testerSeeSubmissions, setTesterSeeSubmissions] = useState(contest.testerSeeSubmissions);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernames = [
    ...authors,
    ...curators,
    ...testers,
    ...spectators,
    ...viewScoreboard,
    ...viewSubmissions,
  ];
  const profiles = useQuery(api.pages.admin.console.resolveProfiles, { usernames });

  function idsFor(list: string[]): Id<"profiles">[] {
    const map = profiles?.ids ?? {};
    return list.map((username) => map[username]).filter((id): id is Id<"profiles"> => !!id);
  }

  async function save() {
    setError(null);
    if (authors.length === 0) {
      setError(t("errorNoAuthor"));
      return;
    }
    setBusy(true);
    try {
      await update({
        key: contest.key,
        authorProfileIds: idsFor(authors),
        curatorProfileIds: idsFor(curators),
        testerProfileIds: idsFor(testers),
        spectatorProfileIds: idsFor(spectators),
        viewContestScoreboardProfileIds: idsFor(viewScoreboard),
        viewContestSubmissionsProfileIds: idsFor(viewSubmissions),
        testerSeeScoreboard,
        testerSeeSubmissions,
        reason: reason.trim(),
      });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title={t("sectionStaff")}>
        <Field label={t("authors")} htmlFor={ids.authors} hint={t("authorsHint")}>
          <UserPicker id={ids.authors} values={authors} onChange={setAuthors} ariaLabel={t("authors")} />
        </Field>
        <Field label={t("curators")} htmlFor={ids.curators} hint={t("curatorsHint")}>
          <UserPicker id={ids.curators} values={curators} onChange={setCurators} ariaLabel={t("curators")} />
        </Field>
        <Field label={t("testers")} htmlFor={ids.testers} hint={t("testersHint")}>
          <UserPicker id={ids.testers} values={testers} onChange={setTesters} ariaLabel={t("testers")} />
        </Field>
        <Field label={t("spectators")} htmlFor={ids.spectators} hint={t("spectatorsHint")}>
          <UserPicker
            id={ids.spectators}
            values={spectators}
            onChange={setSpectators}
            ariaLabel={t("spectators")}
          />
        </Field>
      </AdminSection>

      <AdminSection title={t("sectionTesters")}>
        <AdminCheckField
          label={t("testerSeeScoreboard")}
          checked={testerSeeScoreboard}
          onCheckedChange={setTesterSeeScoreboard}
        />
        <AdminCheckField
          label={t("testerSeeSubmissions")}
          checked={testerSeeSubmissions}
          onCheckedChange={setTesterSeeSubmissions}
        />
      </AdminSection>

      <AdminSection title={t("sectionViewers")}>
        <Field label={t("viewScoreboard")} htmlFor={ids.scoreboard} hint={t("viewScoreboardHint")}>
          <UserPicker
            id={ids.scoreboard}
            values={viewScoreboard}
            onChange={setViewScoreboard}
            ariaLabel={t("viewScoreboard")}
          />
        </Field>
        <Field label={t("viewSubmissions")} htmlFor={ids.submissions} hint={t("viewSubmissionsHint")}>
          <UserPicker
            id={ids.submissions}
            values={viewSubmissions}
            onChange={setViewSubmissions}
            ariaLabel={t("viewSubmissions")}
          />
        </Field>
      </AdminSection>
      <AdminFormFooter busy={busy} submitLabel={t("submit")} />
    </AdminForm>
  );
}
