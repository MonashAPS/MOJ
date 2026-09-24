"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { problemReleaseWarnings } from "@moj/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  EmptyState,
  Input,
  Panel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronUp, GripVertical, ListChecks, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AdminFormError, JobProgress } from "@/components/admin";
import { formatDateTime } from "@/lib/format";
import { WarningLine } from "./ContestSummary";
import type { ContestEdit } from "./types";

type ContestProblem = ContestEdit["problems"][number];

/** `ContestProblemInline`: the sortable inline, with the rejudge column DMOJ
 *  puts at the end of each row. */
export function ContestProblemsTab({ contest }: { contest: ContestEdit }) {
  const t = useTranslations("admin.contests.problems");
  const warn = useTranslations("admin.contests.warnings");
  const actions = useTranslations("common.actions");
  const addProblem = useMutation(api.admin.contests.addProblem);
  const updateProblem = useMutation(api.admin.contests.updateProblem);
  const removeProblem = useMutation(api.admin.contests.removeProblem);
  const reorderProblems = useMutation(api.admin.contests.reorderProblems);
  const rejudgeProblem = useMutation(api.admin.contests.rejudgeProblem);
  const updateContest = useMutation(api.admin.contests.update);

  const [term, setTerm] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [pendingRemove, setPendingRemove] = useState<ContestProblem | null>(null);
  const [pendingRejudge, setPendingRejudge] = useState<ContestProblem | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const matches = useQuery(api.pages.admin.problems.search, pickerOpen ? { term, limit: 10 } : "skip");

  const candidates = (matches ?? []).filter(
    (row) => !contest.problems.some((problem) => problem.code === row.code),
  );

  const listReleaseBoundary =
    contest.problemListReleaseAt === "start"
      ? contest.startTime
      : contest.problemListReleaseAt === "end"
        ? contest.endTime
        : null;

  async function guard<T>(work: () => Promise<T>) {
    setError(null);

    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
  }

  async function move(index: number, delta: number) {
    const next = [...contest.problems];
    const target = index + delta;

    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);

    if (!moved) return;
    next.splice(target, 0, moved);
    await guard(() =>
      reorderProblems({
        key: contest.key,
        order: next.map((row) => row.id),
        reason: "Reordered the contest problems",
      }),
    );
  }

  async function dropOn(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const next = [...contest.problems];
    const from = next.findIndex((row) => row.id === dragging);
    const to = next.findIndex((row) => row.id === targetId);

    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);

    if (!moved) return;
    next.splice(to, 0, moved);
    setDragging(null);
    await guard(() =>
      reorderProblems({
        key: contest.key,
        order: next.map((row) => row.id),
        reason: "Reordered the contest problems",
      }),
    );
  }

  async function setPolicy(field: "problemListReleaseAt" | "publishProblemsAt", next: string) {
    await guard(async () => {
      await updateContest({
        key: contest.key,
        [field]: next === "start" || next === "end" ? next : null,
      });
      toast.success(t(field === "problemListReleaseAt" ? "releaseSaved" : "publishSaved"));
    });
  }

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={contest.key} onDismiss={() => setJobId(null)} /> : null}

      <Panel title={t("releaseTitle")} bodyClassName="grid gap-3 p-4">
        <RadioGroup
          variant="card"
          name="release-contest-problems"
          ariaLabel={t("releaseTitle")}
          value={contest.problemListReleaseAt ?? "never"}
          onValueChange={(next) => void setPolicy("problemListReleaseAt", next)}
          options={[
            { value: "never", label: t("releaseNever"), description: t("releaseNeverHint") },
            {
              value: "start",
              label: t("releaseStart"),
              description: t("releaseStartHint"),
            },
            {
              value: "end",
              label: t("releaseEnd"),
              description: t("releaseEndHint"),
            },
          ]}
        />
        {listReleaseBoundary !== null && listReleaseBoundary <= Date.now() ? (
          <p className="text-sm text-muted-foreground">
            {t("listReleasedDone", { at: formatDateTime(listReleaseBoundary) })}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{t("listReleaseReversible")}</p>
      </Panel>

      <Panel title={t("publishTitle")} bodyClassName="grid gap-3 p-4">
        <RadioGroup
          variant="card"
          name="publish-contest-problems"
          ariaLabel={t("publishTitle")}
          value={contest.publishProblemsAt ?? "never"}
          onValueChange={(next) => void setPolicy("publishProblemsAt", next)}
          options={[
            { value: "never", label: t("releaseNever"), description: t("publishNeverHint") },
            { value: "start", label: t("releaseStart"), description: t("publishStartHint") },
            { value: "end", label: t("releaseEnd"), description: t("publishEndHint") },
          ]}
        />
        <p className="text-sm text-muted-foreground">{t("publishIrreversible")}</p>
        {contest.problemsPublishedAt !== null ? (
          <p className="text-sm text-muted-foreground">
            {t("problemsPublishedDone", { at: formatDateTime(contest.problemsPublishedAt) })}
          </p>
        ) : null}
      </Panel>

      {problemReleaseWarnings(contest).map((warning) => (
        <WarningLine key={warning.key} severity={warning.severity} text={warn(warning.key)} />
      ))}

      <Panel title={t("panelTitle", { count: contest.problems.length })} bodyClassName="grid gap-0 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" icon={<Plus aria-hidden />}>
                {t("addProblem")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  value={term}
                  onValueChange={setTerm}
                  placeholder={t("searchPlaceholder")}
                  showEscHint={false}
                />
                <CommandList>
                  <CommandEmpty>
                    {term.trim() ? t("searchNoMatch", { term: term.trim() }) : t("searchPrompt")}
                  </CommandEmpty>
                  {candidates.length > 0 ? (
                    <CommandGroup>
                      {candidates.map((option) => (
                        <CommandItem
                          key={option.code}
                          value={option.code}
                          onSelect={async () => {
                            setPickerOpen(false);
                            setTerm("");
                            await guard(() =>
                              addProblem({
                                key: contest.key,
                                problemCode: option.code,
                                points: option.points,
                                reason: `Added problem ${option.code}`,
                              }),
                            );
                          }}
                        >
                          <span className="truncate font-mono text-mono">{option.code}</span>
                          <span className="ml-2 min-w-0 flex-1 truncate text-muted-foreground">
                            {option.name}
                          </span>
                          <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                            {option.points}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {contest.problems.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<ListChecks aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-12">{t("columnLabel")}</TableHead>
                <TableHead>{t("columnProblem")}</TableHead>
                <TableHead numeric className="w-24">
                  {t("columnPoints")}
                </TableHead>
                <TableHead className="w-20">{t("columnPartial")}</TableHead>
                <TableHead className="w-24">{t("columnPretested")}</TableHead>
                <TableHead numeric className="w-32">
                  {t("columnMaxSubmissions")}
                </TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contest.problems.map((problem, index) => (
                <TableRow
                  key={problem.id}
                  draggable
                  onDragStart={() => setDragging(problem.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropOn(problem.id)}
                  selected={dragging === problem.id}
                >
                  <TableCell className="px-1 text-muted-foreground">
                    <GripVertical className="size-4" aria-hidden />
                  </TableCell>
                  <TableCell className="font-mono text-mono font-medium">{problem.label}</TableCell>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-mono text-muted-foreground">{problem.code}</span>
                      <span className="truncate">{problem.name}</span>
                    </div>
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      mono
                      inputMode="decimal"
                      aria-label={t("pointsFor", { code: problem.code })}
                      defaultValue={String(problem.points)}
                      onBlur={(event) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id,
                            points: Number(event.target.value) || 0,
                            reason: `Changed the points for ${problem.code}`,
                          }),
                        )
                      }
                      className="ml-auto h-(--control-h-sm) w-[80px] text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      id={`partial-${problem.id}`}
                      aria-label={t("partialFor", { code: problem.code })}
                      checked={problem.partial}
                      onCheckedChange={(checked) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id,
                            partial: checked,
                            reason: `Changed partial scoring for ${problem.code}`,
                          }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      id={`pretested-${problem.id}`}
                      aria-label={t("pretestedFor", { code: problem.code })}
                      checked={problem.isPretested}
                      onCheckedChange={(checked) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id,
                            isPretested: checked,
                            reason: `Changed pretesting for ${problem.code}`,
                          }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      mono
                      inputMode="numeric"
                      aria-label={t("maxSubmissionsFor", { code: problem.code })}
                      placeholder="∞"
                      defaultValue={problem.maxSubmissions === null ? "" : String(problem.maxSubmissions)}
                      onBlur={(event) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id,
                            maxSubmissions: event.target.value.trim() ? Number(event.target.value) : null,
                            reason: `Changed the submission limit for ${problem.code}`,
                          }),
                        )
                      }
                      className="ml-auto h-(--control-h-sm) w-[90px] text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveUp", { code: problem.code })}
                        disabled={index === 0}
                        title={index === 0 ? t("alreadyFirst") : undefined}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("moveDown", { code: problem.code })}
                        disabled={index === contest.problems.length - 1}
                        title={index === contest.problems.length - 1 ? t("alreadyLast") : undefined}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDown aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingRejudge(problem)}>
                        {t("rejudge")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("removeFromContest", { code: problem.code })}
                        onClick={() => setPendingRemove(problem)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {contest.problems.some((problem) => problem.isPretested) ? (
        <p className="text-sm text-muted-foreground">
          <Badge variant="warn" rounding="square">
            {t("pretestsInUse")}
          </Badge>
        </p>
      ) : null}

      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("removeTitle", { code: pendingRemove?.code ?? "", name: contest.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("removeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingRemove;
                setPendingRemove(null);

                if (!target) return;
                await guard(() =>
                  removeProblem({
                    key: contest.key,
                    contestProblemId: target.id,
                    reason: `Removed problem ${target.code}`,
                  }),
                );
                toast.success(t("removed", { code: target.code }));
              }}
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingRejudge !== null} onOpenChange={(open) => !open && setPendingRejudge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rejudgeTitle", { code: pendingRejudge?.code ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("rejudgeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingRejudge;
                setPendingRejudge(null);

                if (!target) return;
                await guard(async () => {
                  const result = await rejudgeProblem({
                    key: contest.key,
                    contestProblemId: target.id,
                    reason: `Rejudged ${target.code}`,
                  });

                  setJobId(result.jobId);
                  toast.success(t("rejudgeQueued"));
                });
              }}
            >
              {t("rejudge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
