"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
import { useState } from "react";
import { AdminFormError, JobProgress } from "@/components/admin";
import type { ContestEdit } from "./types";

type ContestProblem = ContestEdit["problems"][number];

/** `ContestProblemInline`: the sortable inline, with the rejudge column DMOJ
 *  puts at the end of each row. */
export function ContestProblemsTab({ contest }: { contest: ContestEdit }) {
  const addProblem = useMutation(api.admin.contests.addProblem);
  const updateProblem = useMutation(api.admin.contests.updateProblem);
  const removeProblem = useMutation(api.admin.contests.removeProblem);
  const reorderProblems = useMutation(api.admin.contests.reorderProblems);
  const rejudgeProblem = useMutation(api.admin.contests.rejudgeProblem);

  const [term, setTerm] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [pendingRemove, setPendingRemove] = useState<ContestProblem | null>(null);
  const [pendingRejudge, setPendingRejudge] = useState<ContestProblem | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const matches = useQuery(api.pages.admin1.problemSearch, pickerOpen ? { term, limit: 10 } : "skip");
  const candidates = (matches ?? []).filter(
    (row) => !contest.problems.some((problem) => problem.code === row.code),
  );

  async function guard(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
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
        order: next.map((row) => row.id as Id<"contestProblems">),
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
        order: next.map((row) => row.id as Id<"contestProblems">),
        reason: "Reordered the contest problems",
      }),
    );
  }

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />
      {jobId ? <JobProgress jobId={jobId} title={contest.key} onDismiss={() => setJobId(null)} /> : null}

      <Panel title={`Problems (${contest.problems.length})`} bodyClassName="grid gap-0 p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" icon={<Plus aria-hidden />}>
                Add a problem
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  value={term}
                  onValueChange={setTerm}
                  placeholder="Problem code or name"
                  showEscHint={false}
                />
                <CommandList>
                  <CommandEmpty>
                    {term.trim() ? `No problem matches ${term.trim()}.` : "Type to search problems."}
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
          <span className="text-sm text-muted-foreground">
            Drag a row by its handle, or use the arrows, to change the order the labels follow.
          </span>
        </div>

        {contest.problems.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<ListChecks aria-hidden />}
            title="This contest has no problems"
            description="Add one by its code; its label follows the order of this list."
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-12">Label</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead numeric className="w-24">
                  Points
                </TableHead>
                <TableHead className="w-20">Partial</TableHead>
                <TableHead className="w-24">Pretested</TableHead>
                <TableHead numeric className="w-32">
                  Max submissions
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
                      aria-label={`Points for ${problem.code}`}
                      defaultValue={String(problem.points)}
                      onBlur={(event) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id as Id<"contestProblems">,
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
                      aria-label={`Partial scoring for ${problem.code}`}
                      checked={problem.partial}
                      onCheckedChange={(checked) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id as Id<"contestProblems">,
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
                      aria-label={`Pretested for ${problem.code}`}
                      checked={problem.isPretested}
                      onCheckedChange={(checked) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id as Id<"contestProblems">,
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
                      aria-label={`Maximum submissions for ${problem.code}`}
                      placeholder="∞"
                      defaultValue={problem.maxSubmissions === null ? "" : String(problem.maxSubmissions)}
                      onBlur={(event) =>
                        guard(() =>
                          updateProblem({
                            key: contest.key,
                            contestProblemId: problem.id as Id<"contestProblems">,
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
                        aria-label={`Move ${problem.code} up`}
                        disabled={index === 0}
                        title={index === 0 ? "Already first." : undefined}
                        onClick={() => move(index, -1)}
                      >
                        <ChevronUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${problem.code} down`}
                        disabled={index === contest.problems.length - 1}
                        title={index === contest.problems.length - 1 ? "Already last." : undefined}
                        onClick={() => move(index, 1)}
                      >
                        <ChevronDown aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingRejudge(problem)}>
                        Rejudge
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${problem.code} from the contest`}
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

      <p className="text-sm text-muted-foreground">
        Points, partial scoring, pretesting and the submission limit save as soon as the field loses focus.
        Every one of them writes a revision.{" "}
        {contest.problems.some((problem) => problem.isPretested) ? (
          <Badge variant="warn" shape="square">
            Pretests in use
          </Badge>
        ) : null}
      </p>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pendingRemove?.code} from {contest.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The problem itself and its submissions are kept. The contest's labels close the gap, so the
              letters after it shift up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingRemove;
                setPendingRemove(null);
                if (!target) return;
                await guard(() =>
                  removeProblem({
                    key: contest.key,
                    contestProblemId: target.id as Id<"contestProblems">,
                    reason: `Removed problem ${target.code}`,
                  }),
                );
                toast.success(`${target.code} was removed from the contest.`);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingRejudge !== null} onOpenChange={(open) => !open && setPendingRejudge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejudge every submission to {pendingRejudge?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only submissions made inside this contest are touched. They queue behind live judging, and the
              scoreboard follows as each one finishes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = pendingRejudge;
                setPendingRejudge(null);
                if (!target) return;
                await guard(async () => {
                  const result = await rejudgeProblem({
                    key: contest.key,
                    contestProblemId: target.id as Id<"contestProblems">,
                    reason: `Rejudged ${target.code}`,
                  });
                  setJobId(result.jobId);
                  toast.success("Rejudge queued");
                });
              }}
            >
              Rejudge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
