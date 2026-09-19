"use client";

import { api } from "@convex/_generated/api";
import type { Audience } from "@moj/core";
import { Field, toast } from "@moj/ui";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  UserPicker,
  useResolvedRefs,
} from "@/components/admin";
import { AudienceName } from "@/components/audiences/AudienceSelect";
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
  const [alwaysAdmit, setAlwaysAdmit] = useState<string[]>(contest.alwaysAdmit);
  const [viewSubmissions, setViewSubmissions] = useState<string[]>(contest.viewContestSubmissions);
  const [testerSeeScoreboard, setTesterSeeScoreboard] = useState(contest.testerSeeScoreboard);
  const [testerSeeSubmissions, setTesterSeeSubmissions] = useState(contest.testerSeeSubmissions);
  const [spectatorSeeScoreboard, setSpectatorSeeScoreboard] = useState(contest.spectatorSeeScoreboard);

  const [spectatorSeeProblemsEarly, setSpectatorSeeProblemsEarly] = useState(
    contest.spectatorSeeProblemsEarly,
  );

  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refs = useResolvedRefs({
    usernames: [...authors, ...curators, ...testers, ...spectators, ...alwaysAdmit, ...viewSubmissions],
  });

  const idsFor = refs.profileIdsFor;

  async function save() {
    setError(null);

    if (authors.length === 0) {
      setError(t("errorNoAuthor"));

      return;
    }

    // A username that resolved to nothing used to be dropped, which quietly
    // removed people from the staff lists the save was meant to preserve.
    if (refs.blockedMessage) {
      setError(refs.blockedMessage);

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
        alwaysAdmitProfileIds: idsFor(alwaysAdmit),
        viewContestSubmissionsProfileIds: idsFor(viewSubmissions),
        testerSeeScoreboard,
        testerSeeSubmissions,
        spectatorSeeScoreboard,
        spectatorSeeProblemsEarly,
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

      <AdminSection title={t("sectionAudiences")} description={t("audiencesHint")} columns={1}>
        <div className="grid gap-3 sm:grid-cols-2">
          <AudienceCard audience="staff" count={authors.length + curators.length} />
          <AudienceCard audience="testers" count={testers.length}>
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
            <p className="text-xs text-muted-foreground">{t("testerSeeProblemsAlways")}</p>
          </AudienceCard>
          <AudienceCard audience="spectators" count={spectators.length}>
            <AdminCheckField
              label={t("spectatorSeeScoreboard")}
              checked={spectatorSeeScoreboard}
              onCheckedChange={setSpectatorSeeScoreboard}
            />
            <AdminCheckField
              label={t("spectatorSeeProblemsEarly")}
              checked={spectatorSeeProblemsEarly}
              onCheckedChange={setSpectatorSeeProblemsEarly}
            />
          </AudienceCard>
          <AudienceCard audience="contestants" count={contest.userCount} />
          <AudienceCard audience="everyone" />
        </div>
      </AdminSection>

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

      <AdminSection title={t("sectionViewers")}>
        <Field label={t("alwaysAdmit")} htmlFor={ids.scoreboard} hint={t("alwaysAdmitHint")}>
          <UserPicker
            id={ids.scoreboard}
            values={alwaysAdmit}
            onChange={setAlwaysAdmit}
            ariaLabel={t("alwaysAdmit")}
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

/** One audience: its mark, its definition, how many are in it, and the options it carries. */
function AudienceCard({
  audience,
  count,
  children,
}: {
  audience: Audience;
  count?: number;
  children?: ReactNode;
}) {
  const t = useTranslations("common.audiences");

  return (
    <div className="grid gap-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2 text-sm font-medium text-foreground">
        <AudienceName audience={audience} />
        {count !== undefined ? (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{t(`${audience}Hint`)}</p>
      {children ? <div className="grid gap-1.5 border-t border-border pt-2">{children}</div> : null}
    </div>
  );
}
