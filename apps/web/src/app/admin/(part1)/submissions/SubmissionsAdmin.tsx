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
  Input,
  MultiSelect,
  Panel,
  Select,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  toast,
  VerdictPill,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type AdminColumn,
  AdminFormError,
  AdminPager,
  AdminShell,
  AdminTable,
  AdminToolbar,
  JobProgress,
} from "@/components/admin";
import { useAdminSubmissionsList } from "@/components/admin/fallbacks";
import { formatDateTime, formatRelative } from "@/lib/format";

const RESULTS = ["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"];
const STATUSES = [
  { value: "any", label: "Any status" },
  { value: "QU", label: "Queued" },
  { value: "P", label: "Processing" },
  { value: "G", label: "Grading" },
  { value: "D", label: "Done" },
  { value: "CE", label: "Compile error" },
  { value: "IE", label: "Internal error" },
  { value: "AB", label: "Aborted" },
];
const PAGE_SIZE = 50;

type Row = {
  id: string;
  legacyId: number | null;
  displayId: number | string;
  date: number;
  username: string;
  problemCode: string;
  problemName: string;
  language: string;
  status: string;
  result: string | null;
  points: number | null;
  total: number;
  time: number | null;
  memory: number | null;
  judge: string | null;
  contestKey: string | null;
  isLocked: boolean;
};

function memoryText(kb: number | null): string {
  if (kb === null) return "—";
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${kb} KB`;
}

export function SubmissionsAdmin() {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/submissions/";
  const params = useSearchParams();

  const username = params.get("user") ?? "";
  const problemCode = params.get("problem") ?? "";
  const contestKey = params.get("contest") ?? "";
  const judgeName = params.get("judge") ?? "";
  const status = params.get("status") ?? "any";
  const results = (params.get("results") ?? "").split(",").filter(Boolean);
  const languageKeys = (params.get("languages") ?? "").split(",").filter(Boolean);
  const idFrom = params.get("from") ?? "";
  const idTo = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [userDraft, setUserDraft] = useState(username);
  const [problemDraft, setProblemDraft] = useState(problemCode);
  const [fromDraft, setFromDraft] = useState(idFrom);
  const [toDraft, setToDraft] = useState(idTo);
  useEffect(() => setUserDraft(username), [username]);
  useEffect(() => setProblemDraft(problemCode), [problemCode]);

  const [open, setOpen] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [confirmBatch, setConfirmBatch] = useState(false);

  const languages = useQuery(api.languages.list, {});
  const judges = useQuery(api.judges.list, {});
  const judgeNames = Array.isArray(judges) ? [] : (judges?.judges ?? []).map((judge) => judge.name);
  const { data } = useAdminSubmissionsList({
    username: username || undefined,
    problemCode: problemCode || undefined,
    contestKey: contestKey || undefined,
    judgeName: judgeName || undefined,
    status: status === "any" ? undefined : status,
    results: results.length > 0 ? results : undefined,
    languageKeys: languageKeys.length > 0 ? languageKeys : undefined,
    idFrom: idFrom ? Number(idFrom) : undefined,
    idTo: idTo ? Number(idTo) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rejudgeOne = useMutation(api.admin.submissions.rejudgeOne);
  const batchRejudge = useMutation(api.admin.submissions.batchRejudge);
  const abort = useMutation(api.submissions.abort);
  const rescoreProblem = useMutation(api.admin.submissions.rescoreProblem);

  const preview = useQuery(
    api.admin.problems.rejudgePreview,
    problemCode
      ? {
          code: problemCode,
          idRange: idFrom && idTo ? { start: Number(idFrom), end: Number(idTo) } : undefined,
          languages: languageKeys.length > 0 ? languageKeys : undefined,
          results: results.length > 0 ? results : undefined,
          archiveLocked: false,
        }
      : "skip",
  );

  function withParams(next: Record<string, string | null>): string {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") query.delete(key);
      else query.set(key, value);
    }
    if (!("page" in next)) query.delete("page");
    const text = query.toString();
    return text ? `${pathname}?${text}` : pathname;
  }

  function go(next: Record<string, string | null>) {
    router.replace(withParams(next), { scroll: false });
  }

  const rows: Row[] = data?.items ?? [];
  const filtered =
    !!username ||
    !!problemCode ||
    !!contestKey ||
    !!judgeName ||
    status !== "any" ||
    results.length > 0 ||
    languageKeys.length > 0 ||
    !!idFrom ||
    !!idTo;

  async function guard(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action was refused.");
    }
  }

  const columns: AdminColumn<Row>[] = [
    {
      key: "id",
      header: "Id",
      numeric: true,
      cell: (row) => String(row.displayId),
    },
    {
      key: "verdict",
      header: "Verdict",
      cell: (row) =>
        row.result ? (
          <VerdictPill verdict={row.result} judging={row.status === "G" || row.status === "P"} />
        ) : (
          <Badge variant="run" shape="square">
            {row.status === "QU" ? "Queued" : row.status === "G" ? "Grading" : row.status}
          </Badge>
        ),
    },
    {
      key: "score",
      header: "Score",
      numeric: true,
      cell: (row) =>
        row.points === null ? (
          "—"
        ) : (
          <>
            {row.points}
            <span className="text-muted-foreground"> / {row.total}</span>
          </>
        ),
    },
    {
      key: "problem",
      header: "Problem",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-mono text-muted-foreground">{row.problemCode}</span>
          <span className="truncate">{row.problemName}</span>
        </div>
      ),
    },
    { key: "user", header: "User", cell: (row) => <span className="font-mono text-sm">{row.username}</span> },
    {
      key: "language",
      header: "Language",
      cell: (row) => <span className="font-mono text-sm">{row.language}</span>,
    },
    {
      key: "time",
      header: "Time",
      numeric: true,
      cell: (row) => (row.time === null ? "—" : `${row.time.toFixed(2)}s`),
    },
    { key: "memory", header: "Memory", numeric: true, cell: (row) => memoryText(row.memory) },
    {
      key: "judge",
      header: "Judge",
      cell: (row) => <span className="font-mono text-sm">{row.judge ?? "—"}</span>,
    },
    {
      key: "date",
      header: "When",
      numeric: true,
      cell: (row) => (
        <time dateTime={new Date(row.date).toISOString()} title={formatDateTime(row.date)}>
          {formatRelative(row.date)}
        </time>
      ),
    },
    {
      key: "open",
      header: "",
      cell: (row) => (
        <div className="text-right">
          <Button variant="ghost" size="sm" onClick={() => setOpen(row)}>
            Manage
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title="Submissions"
      breadcrumb={[{ label: "Staff console", href: "/admin/" }, { label: "Submissions" }]}
    >
      <div className="grid gap-4">
        <AdminFormError message={error} />
        {jobId ? <JobProgress jobId={jobId} title="Batch rejudge" onDismiss={() => setJobId(null)} /> : null}

        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={data === undefined}
          caption="Every submission on the site"
          empty={{
            title: filtered ? "No submissions match" : "No submissions yet",
            description: filtered
              ? "No submissions match these filters."
              : "Submissions appear here as members solve problems.",
            action: filtered ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                Clear filters
              </Button>
            ) : undefined,
          }}
          toolbar={
            <div className="grid gap-2">
              <AdminToolbar>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    go({ user: userDraft });
                  }}
                >
                  <Input
                    icon={<Search aria-hidden />}
                    value={userDraft}
                    onChange={(event) => setUserDraft(event.target.value)}
                    placeholder="Username"
                    aria-label="Filter by user"
                    className="h-(--control-h-sm) w-[170px]"
                  />
                </form>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    go({ problem: problemDraft });
                  }}
                >
                  <Input
                    icon={<Search aria-hidden />}
                    value={problemDraft}
                    onChange={(event) => setProblemDraft(event.target.value)}
                    placeholder="Problem code"
                    aria-label="Filter by problem"
                    className="h-(--control-h-sm) w-[170px]"
                  />
                </form>
                <Select
                  size="sm"
                  ariaLabel="Status"
                  value={status}
                  onValueChange={(value) => go({ status: value === "any" ? null : value })}
                  options={STATUSES}
                  className="w-[150px]"
                />
                <Select
                  size="sm"
                  ariaLabel="Judge"
                  value={judgeName || "any"}
                  onValueChange={(value) => go({ judge: value === "any" ? null : value })}
                  options={[
                    { value: "any", label: "Any judge" },
                    ...judgeNames.map((judge) => ({ value: judge, label: judge })),
                  ]}
                  className="w-[150px]"
                />
              </AdminToolbar>
              <AdminToolbar>
                <div className="w-[220px]">
                  <MultiSelect
                    values={results}
                    onChange={(next) => go({ results: next.join(",") })}
                    options={RESULTS.map((code) => ({ value: code, label: code }))}
                    placeholder="Any result"
                    ariaLabel="Results"
                  />
                </div>
                <div className="w-[220px]">
                  <MultiSelect
                    values={languageKeys}
                    onChange={(next) => go({ languages: next.join(",") })}
                    options={(languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
                    placeholder="Any language"
                    ariaLabel="Languages"
                  />
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    go({ from: fromDraft, to: toDraft });
                  }}
                >
                  <Input
                    mono
                    inputMode="numeric"
                    value={fromDraft}
                    onChange={(event) => setFromDraft(event.target.value)}
                    placeholder="From id"
                    aria-label="From submission id"
                    className="h-(--control-h-sm) w-[100px]"
                  />
                  <span aria-hidden className="text-muted-foreground">
                    –
                  </span>
                  <Input
                    mono
                    inputMode="numeric"
                    value={toDraft}
                    onChange={(event) => setToDraft(event.target.value)}
                    placeholder="To id"
                    aria-label="To submission id"
                    className="h-(--control-h-sm) w-[100px]"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Apply
                  </Button>
                </form>
              </AdminToolbar>
            </div>
          }
          footer={
            <AdminPager
              page={page}
              pageSize={PAGE_SIZE}
              total={data?.total ?? 0}
              noun="submission"
              hrefFor={(next) => withParams({ page: String(next) })}
            />
          }
        />

        <Panel title="Batch rejudge" bodyClassName="grid gap-3 p-4">
          {problemCode ? (
            <>
              <p className="text-sm text-muted-foreground">
                The filters above become the batch. Only a single problem can be rejudged at a time, so a
                problem code is required.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-subtle">
                  {preview === undefined
                    ? "Counting…"
                    : `${preview.count.toLocaleString("en-AU")} of ${preview.total.toLocaleString("en-AU")} submissions to ${problemCode} would be rejudged`}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      guard(async () => {
                        const result = await rescoreProblem({ problemCode });
                        setJobId(result.jobId);
                        toast.success("Rescore queued");
                      })
                    }
                  >
                    Rescore {problemCode}
                  </Button>
                  <Button
                    size="sm"
                    disabled={(preview?.count ?? 0) === 0}
                    title={(preview?.count ?? 0) === 0 ? "Nothing matches this filter." : undefined}
                    onClick={() => setConfirmBatch(true)}
                  >
                    Rejudge these
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Filter by a problem code to rejudge or rescore a batch of its submissions.
            </p>
          )}
        </Panel>
      </div>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent side="right" className="w-[420px] max-w-[92vw] gap-0">
          <SheetHeader>
            <SheetTitle>Submission {open ? String(open.displayId) : ""}</SheetTitle>
          </SheetHeader>
          {open ? (
            <div className="grid gap-4 overflow-y-auto p-4">
              <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-base">
                <dt className="text-subtle">Problem</dt>
                <dd className="min-w-0">
                  <Link className="text-link hover:underline" href={`/admin/problems/${open.problemCode}/`}>
                    {open.problemName}
                  </Link>
                </dd>
                <dt className="text-subtle">User</dt>
                <dd className="font-mono text-mono">{open.username}</dd>
                <dt className="text-subtle">Verdict</dt>
                <dd>{open.result ? <VerdictPill verdict={open.result} /> : open.status}</dd>
                <dt className="text-subtle">Score</dt>
                <dd className="font-mono text-mono tabular-nums">
                  {open.points === null ? "—" : `${open.points} / ${open.total}`}
                </dd>
                <dt className="text-subtle">Language</dt>
                <dd className="font-mono text-mono">{open.language}</dd>
                <dt className="text-subtle">Time</dt>
                <dd className="font-mono text-mono tabular-nums">
                  {open.time === null ? "—" : `${open.time.toFixed(2)}s`}
                </dd>
                <dt className="text-subtle">Memory</dt>
                <dd className="font-mono text-mono tabular-nums">{memoryText(open.memory)}</dd>
                <dt className="text-subtle">Judge</dt>
                <dd className="font-mono text-mono">{open.judge ?? "—"}</dd>
                <dt className="text-subtle">Contest</dt>
                <dd className="font-mono text-mono">{open.contestKey ?? "—"}</dd>
                <dt className="text-subtle">Submitted</dt>
                <dd className="font-mono text-mono tabular-nums">{formatDateTime(open.date)}</dd>
              </dl>

              {open.isLocked ? (
                <p className="text-sm text-warn">
                  This submission is locked by its contest. Only a superuser may rejudge it.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  onClick={() =>
                    guard(async () => {
                      await rejudgeOne({ submissionId: open.id });
                      toast.success(`Submission ${open.displayId} queued for rejudging`);
                    })
                  }
                >
                  Rejudge
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={open.status !== "P" && open.status !== "G" && open.status !== "QU"}
                  title={
                    open.status === "P" || open.status === "G" || open.status === "QU"
                      ? undefined
                      : "Only a submission still being judged can be aborted."
                  }
                  onClick={() =>
                    guard(async () => {
                      await abort({ submissionId: open.id });
                      toast.success(`Submission ${open.displayId} was aborted`);
                    })
                  }
                >
                  Abort
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    guard(async () => {
                      const result = await rescoreProblem({ problemCode: open.problemCode });
                      setJobId(result.jobId);
                      toast.success("Rescore queued");
                    })
                  }
                >
                  Rescore the problem
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/submission/${open.displayId}/`}>Open the status page</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmBatch} onOpenChange={setConfirmBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rejudge {preview?.count ?? 0} {preview?.count === 1 ? "submission" : "submissions"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every submission to {problemCode} matching the current filters goes back in the queue at
              batch-rejudge priority, so live judging is unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmBatch(false);
                guard(async () => {
                  const result = await batchRejudge({
                    problemCode,
                    idRange: idFrom && idTo ? [Number(idFrom), Number(idTo)] : undefined,
                    languageKeys: languageKeys.length > 0 ? languageKeys : undefined,
                    results: results.length > 0 ? results : undefined,
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
    </AdminShell>
  );
}
