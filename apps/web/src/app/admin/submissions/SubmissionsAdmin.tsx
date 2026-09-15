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
import { useTranslations } from "next-intl";
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
import { formatDateTime, formatRelative } from "@/lib/format";

const RESULTS = ["AC", "WA", "TLE", "MLE", "OLE", "IR", "RTE", "CE", "IE", "SC", "AB"];

const STATUSES = [
  { value: "any", labelKey: "any" },
  { value: "QU", labelKey: "queued" },
  { value: "P", labelKey: "processing" },
  { value: "G", labelKey: "grading" },
  { value: "D", labelKey: "done" },
  { value: "CE", labelKey: "compileError" },
  { value: "IE", labelKey: "internalError" },
  { value: "AB", labelKey: "aborted" },
] as const;

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

export function SubmissionsAdmin() {
  const t = useTranslations("admin.submissions");
  const shell = useTranslations("admin.shell");
  const actions = useTranslations("common.actions");
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/submissions/";
  const params = useSearchParams();

  function memoryText(kb: number | null): string {
    if (kb === null) return "—";

    if (kb >= 1024) return t("units.megabytes", { value: (kb / 1024).toFixed(1) });

    return t("units.kilobytes", { value: kb });
  }

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

  const data = useQuery(api.pages.admin.submissions.list, {
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

  async function guard<T>(work: () => Promise<T>) {
    setError(null);

    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
  }

  const columns: AdminColumn<Row>[] = [
    {
      key: "id",
      header: t("columns.id"),
      numeric: true,
      cell: (row) => String(row.displayId),
    },
    {
      key: "verdict",
      header: t("columns.verdict"),
      cell: (row) =>
        row.result ? (
          <VerdictPill verdict={row.result} judging={row.status === "G" || row.status === "P"} />
        ) : (
          <Badge variant="run" rounding="square">
            {row.status === "QU"
              ? t("statuses.queued")
              : row.status === "G"
                ? t("statuses.grading")
                : row.status}
          </Badge>
        ),
    },
    {
      key: "score",
      header: t("columns.score"),
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
      header: t("columns.problem"),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-mono text-muted-foreground">{row.problemCode}</span>
          <span className="truncate">{row.problemName}</span>
        </div>
      ),
    },
    {
      key: "user",
      header: t("columns.user"),
      cell: (row) => <span className="font-mono text-sm">{row.username}</span>,
    },
    {
      key: "language",
      header: t("columns.language"),
      cell: (row) => <span className="font-mono text-sm">{row.language}</span>,
    },
    {
      key: "time",
      header: t("columns.time"),
      numeric: true,
      cell: (row) => (row.time === null ? "—" : t("units.seconds", { value: row.time.toFixed(2) })),
    },
    { key: "memory", header: t("columns.memory"), numeric: true, cell: (row) => memoryText(row.memory) },
    {
      key: "judge",
      header: t("columns.judge"),
      cell: (row) => <span className="font-mono text-sm">{row.judge ?? "—"}</span>,
    },
    {
      key: "date",
      header: t("columns.when"),
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
            {t("manage")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[{ label: shell("consoleName"), href: "/admin/" }, { label: t("title") }]}
    >
      <div className="grid gap-4">
        <AdminFormError message={error} />
        {jobId ? (
          <JobProgress jobId={jobId} title={t("batch.title")} onDismiss={() => setJobId(null)} />
        ) : null}

        <AdminTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={data === undefined}
          caption={t("caption")}
          empty={{
            title: filtered ? t("emptyFilteredTitle") : t("emptyTitle"),
            description: filtered ? t("emptyFilteredDescription") : t("emptyDescription"),
            action: filtered ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                {t("filters.clear")}
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
                    placeholder={t("filters.userPlaceholder")}
                    aria-label={t("filters.userLabel")}
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
                    placeholder={t("filters.problemPlaceholder")}
                    aria-label={t("filters.problemLabel")}
                    className="h-(--control-h-sm) w-[170px]"
                  />
                </form>
                <Select
                  size="sm"
                  ariaLabel={t("filters.status")}
                  value={status}
                  onValueChange={(value) => go({ status: value === "any" ? null : value })}
                  options={STATUSES.map((option) => ({
                    value: option.value,
                    label: t(`statuses.${option.labelKey}`),
                  }))}
                  className="w-[150px]"
                />
                <Select
                  size="sm"
                  ariaLabel={t("filters.judge")}
                  value={judgeName || "any"}
                  onValueChange={(value) => go({ judge: value === "any" ? null : value })}
                  options={[
                    { value: "any", label: t("filters.anyJudge") },
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
                    placeholder={t("filters.anyResult")}
                    ariaLabel={t("filters.results")}
                  />
                </div>
                <div className="w-[220px]">
                  <MultiSelect
                    values={languageKeys}
                    onChange={(next) => go({ languages: next.join(",") })}
                    options={(languages ?? []).map((row) => ({ value: row.key, label: row.name }))}
                    placeholder={t("filters.anyLanguage")}
                    ariaLabel={t("filters.languages")}
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
                    placeholder={t("filters.fromPlaceholder")}
                    aria-label={t("filters.fromLabel")}
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
                    placeholder={t("filters.toPlaceholder")}
                    aria-label={t("filters.toLabel")}
                    className="h-(--control-h-sm) w-[100px]"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    {t("filters.apply")}
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
              summary={(range) => t("pagerSummary", range)}
              hrefFor={(next) => withParams({ page: String(next) })}
            />
          }
        />

        <Panel title={t("batch.title")} bodyClassName="grid gap-3 p-4">
          {problemCode ? (
            <>
              <p className="text-sm text-muted-foreground">{t("batch.intro")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-subtle">
                  {preview === undefined
                    ? t("batch.counting")
                    : t("batch.preview", {
                        count: preview.count.toLocaleString("en-AU"),
                        total: preview.total.toLocaleString("en-AU"),
                        code: problemCode,
                      })}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      guard(async () => {
                        const result = await rescoreProblem({ problemCode });
                        setJobId(result.jobId);
                        toast.success(t("toasts.rescoreQueued"));
                      })
                    }
                  >
                    {t("batch.rescore", { code: problemCode })}
                  </Button>
                  <Button
                    size="sm"
                    disabled={(preview?.count ?? 0) === 0}
                    title={(preview?.count ?? 0) === 0 ? t("batch.nothingMatches") : undefined}
                    onClick={() => setConfirmBatch(true)}
                  >
                    {t("batch.rejudge")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("batch.needProblem")}</p>
          )}
        </Panel>
      </div>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent side="right" className="w-[420px] max-w-[92vw] gap-0">
          <SheetHeader>
            <SheetTitle>{t("detail.title", { id: open ? String(open.displayId) : "" })}</SheetTitle>
          </SheetHeader>
          {open ? (
            <div className="grid gap-4 overflow-y-auto p-4">
              <dl className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] gap-x-3 gap-y-2 text-base">
                <dt className="text-subtle">{t("detail.problem")}</dt>
                <dd className="min-w-0">
                  <Link className="text-link hover:underline" href={`/admin/problems/${open.problemCode}/`}>
                    {open.problemName}
                  </Link>
                </dd>
                <dt className="text-subtle">{t("detail.user")}</dt>
                <dd className="font-mono text-mono">{open.username}</dd>
                <dt className="text-subtle">{t("detail.verdict")}</dt>
                <dd>{open.result ? <VerdictPill verdict={open.result} /> : open.status}</dd>
                <dt className="text-subtle">{t("detail.score")}</dt>
                <dd className="font-mono text-mono tabular-nums">
                  {open.points === null ? "—" : `${open.points} / ${open.total}`}
                </dd>
                <dt className="text-subtle">{t("detail.language")}</dt>
                <dd className="font-mono text-mono">{open.language}</dd>
                <dt className="text-subtle">{t("detail.time")}</dt>
                <dd className="font-mono text-mono tabular-nums">
                  {open.time === null ? "—" : t("units.seconds", { value: open.time.toFixed(2) })}
                </dd>
                <dt className="text-subtle">{t("detail.memory")}</dt>
                <dd className="font-mono text-mono tabular-nums">{memoryText(open.memory)}</dd>
                <dt className="text-subtle">{t("detail.judge")}</dt>
                <dd className="font-mono text-mono">{open.judge ?? "—"}</dd>
                <dt className="text-subtle">{t("detail.contest")}</dt>
                <dd className="font-mono text-mono">{open.contestKey ?? "—"}</dd>
                <dt className="text-subtle">{t("detail.submitted")}</dt>
                <dd className="font-mono text-mono tabular-nums">{formatDateTime(open.date)}</dd>
              </dl>

              {open.isLocked ? <p className="text-sm text-warn">{t("detail.locked")}</p> : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  size="sm"
                  onClick={() =>
                    guard(async () => {
                      await rejudgeOne({ submissionId: open.id });
                      toast.success(t("toasts.queuedOne", { id: String(open.displayId) }));
                    })
                  }
                >
                  {t("detail.rejudge")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={open.status !== "P" && open.status !== "G" && open.status !== "QU"}
                  title={
                    open.status === "P" || open.status === "G" || open.status === "QU"
                      ? undefined
                      : t("detail.abortDisabled")
                  }
                  onClick={() =>
                    guard(async () => {
                      await abort({ submissionId: open.id });
                      toast.success(t("toasts.abortedOne", { id: String(open.displayId) }));
                    })
                  }
                >
                  {t("detail.abort")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    guard(async () => {
                      const result = await rescoreProblem({ problemCode: open.problemCode });
                      setJobId(result.jobId);
                      toast.success(t("toasts.rescoreQueued"));
                    })
                  }
                >
                  {t("detail.rescoreProblem")}
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/submission/${open.displayId}/`}>{t("detail.openStatus")}</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmBatch} onOpenChange={setConfirmBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("batch.confirmTitle", { count: preview?.count ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("batch.confirmDescription", { code: problemCode })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{actions("cancel")}</AlertDialogCancel>
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
                  toast.success(t("toasts.rejudgeQueued"));
                });
              }}
            >
              {t("batch.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
