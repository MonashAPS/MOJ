"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Field, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  ReasonField,
  UserPicker,
} from "@/components/admin";
import type { ContestEdit } from "./types";

/** DMOJ's first fieldset plus the two "who may look" lists from Access. */
export function ContestPeopleTab({ contest }: { contest: ContestEdit }) {
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
  const [reasonError, setReasonError] = useState<string | undefined>();
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
  const profiles = useQuery(api.pages.admin1.resolveProfiles, { usernames });

  function idsFor(list: string[]): Id<"profiles">[] {
    const map = profiles?.ids ?? {};
    return list.map((username) => map[username]).filter((id): id is Id<"profiles"> => !!id);
  }

  async function save() {
    setError(null);
    if (!reason.trim()) {
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    if (authors.length === 0) {
      setError("A contest needs at least one author.");
      return;
    }
    setReasonError(undefined);
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
      toast.success("People saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title="Staff">
        <Field label="Authors" htmlFor={ids.authors} hint="They may edit the contest and see everything.">
          <UserPicker id={ids.authors} values={authors} onChange={setAuthors} ariaLabel="Authors" />
        </Field>
        <Field label="Curators" htmlFor={ids.curators} hint="The same powers as an author.">
          <UserPicker id={ids.curators} values={curators} onChange={setCurators} ariaLabel="Curators" />
        </Field>
        <Field
          label="Testers"
          htmlFor={ids.testers}
          hint="They may enter before it starts, but cannot edit it."
        >
          <UserPicker id={ids.testers} values={testers} onChange={setTesters} ariaLabel="Testers" />
        </Field>
        <Field
          label="Spectators"
          htmlFor={ids.spectators}
          hint="They watch the contest without a participation of their own."
        >
          <UserPicker
            id={ids.spectators}
            values={spectators}
            onChange={setSpectators}
            ariaLabel="Spectators"
          />
        </Field>
      </AdminSection>

      <AdminSection title="What testers see">
        <AdminCheckField
          label="Testers see the scoreboard"
          checked={testerSeeScoreboard}
          onCheckedChange={setTesterSeeScoreboard}
        />
        <AdminCheckField
          label="Testers see submissions"
          checked={testerSeeSubmissions}
          onCheckedChange={setTesterSeeSubmissions}
        />
      </AdminSection>

      <AdminSection title="Extra viewers">
        <Field
          label="May see the scoreboard"
          htmlFor={ids.scoreboard}
          hint="These users see the full board even while it is hidden or frozen."
        >
          <UserPicker
            id={ids.scoreboard}
            values={viewScoreboard}
            onChange={setViewScoreboard}
            ariaLabel="May see the scoreboard"
          />
        </Field>
        <Field
          label="May see submissions"
          htmlFor={ids.submissions}
          hint="These users see everyone's submissions during the contest."
        >
          <UserPicker
            id={ids.submissions}
            values={viewSubmissions}
            onChange={setViewSubmissions}
            ariaLabel="May see submissions"
          />
        </Field>
      </AdminSection>

      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="contest" />
      <AdminFormFooter busy={busy} submitLabel="Save people" />
    </AdminForm>
  );
}
