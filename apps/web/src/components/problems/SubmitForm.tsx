"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Kbd,
  KbdGroup,
  Select,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { Paperclip, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useContestHref } from "@/components/ContestLink";
import { CodeEditor } from "@/components/problems/CodeEditor";
import { LanguagePicker } from "@/components/problems/LanguagePicker";
import { mutationError } from "@/lib/convex-error";
import { languageForFile, MAX_SOURCE_LENGTH, readSourceFile } from "@/lib/submit-file";
import { useViewerLive } from "@/lib/useViewerLive";

export type SubmitReminder = {
  key: string;
  name: string;
  eligible: boolean;
  acknowledged: boolean;
  serverHadViewer: boolean;
};

type SubmissionAttempt = FunctionArgs<typeof api.submissions.submit>;

function draftKey(code: string, languageKey: string): string {
  return `submit:${code}:${languageKey}`;
}

/** A drag carrying files, rather than a selection moved within the editor. */
function carriesFile(transfer: DataTransfer): boolean {
  return [...transfer.types].includes("Files");
}

export function SubmitForm({
  problemCode,
  problemName,
  defaultLanguageKey,
  initialSource = "",
  canPinJudge,
  submissionsLeft,
  compact = false,
  reminder,
}: {
  problemCode: string;
  problemName: string;
  defaultLanguageKey: string | null;
  initialSource?: string;
  canPinJudge: boolean;
  submissionsLeft: number | null;
  /** Shorter, for the submit dialog the contest's problem list opens. */
  compact?: boolean;
  reminder?: SubmitReminder;
}) {
  const t = useTranslations("problems.submit");
  const router = useRouter();
  // Header dialogs also open on account pages, outside the contest pathname.
  const withContest = useContestHref(reminder?.key);
  const usable = useQuery(api.languages.usableForProblem, { code: problemCode });
  const judges = useQuery(api.judges.list, canPinJudge ? {} : "skip");
  const submit = useMutation(api.submissions.submit);

  const liveContest = useQuery(
    api.contests.navBar,
    reminder ? { key: reminder.key, browsing: true } : "skip",
  );

  const eligible = useViewerLive(
    liveContest === undefined
      ? undefined
      : !!liveContest?.showJoinWarning &&
          liveContest.problems.some((problem) => problem.code === problemCode),
    reminder?.eligible ?? false,
    reminder?.serverHadViewer ?? false,
  );

  const [pendingAttempt, setPendingAttempt] = useState<SubmissionAttempt | null>(null);
  // React state alone cannot block two events delivered before the next render.
  const attemptState = useRef<"idle" | "confirming" | "sending">("idle");
  const returnFocus = useRef<HTMLElement | null>(null);
  const submitButton = useRef<HTMLButtonElement>(null);

  // Follow a preference that loads after mount until the viewer makes a choice.
  const [selectedLanguageKey, setLanguageKey] = useState<string | null>(null);
  const [source, setSource] = useState(initialSource);
  const [judgePin, setJudgePin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const touched = useRef(initialSource.length > 0);
  const filePicker = useRef<HTMLInputElement>(null);

  const languages = usable?.languages ?? [];
  // Keep the preferred or explicitly chosen language only while it is usable.
  const language = languages.find((row) => row.key === (selectedLanguageKey ?? defaultLanguageKey)) ?? null;
  const languageKey = language?.key ?? "";
  const template = useQuery(api.problems.languageTemplate, languageKey ? { languageKey } : "skip");
  const noJudges = usable !== undefined && usable !== null && usable.onlineJudges === 0;
  const exhausted = submissionsLeft !== null && submissionsLeft <= 0;

  // A fresh buffer takes the saved draft, else the language's template.
  useEffect(() => {
    if (!languageKey || touched.current) return;
    let next = "";

    try {
      next = window.localStorage.getItem(draftKey(problemCode, languageKey)) ?? "";
    } catch {
      next = "";
    }

    if (!next && template) next = template.template;

    if (next) setSource(next);
  }, [languageKey, problemCode, template]);

  // Drafts autosave 800ms after the last keystroke, keyed by problem + language.
  useEffect(() => {
    if (!languageKey) return;

    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey(problemCode, languageKey), source);
      } catch {
        // A private window with storage denied is not worth an error on screen.
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [source, languageKey, problemCode]);

  /**
   * A file dropped on the form or picked with the button, the way DOMjudge
   * takes one: the text fills the editor and the extension moves the language,
   * which the picker beside it can still overrule.
   */
  const loadFile = useCallback(
    async (file: File) => {
      setError(null);
      const read = await readSourceFile(file);

      if ("problem" in read) {
        setError(read.problem === "tooLong" ? t("tooLong", { count: MAX_SOURCE_LENGTH }) : t("notText"));

        return;
      }

      const named = languageForFile(file.name, languages, {
        selected: languageKey,
        preferred: defaultLanguageKey,
      });

      if (named) setLanguageKey(named);
      touched.current = true;
      setFileName(file.name);
      setSource(read.source);
    },
    [defaultLanguageKey, languageKey, languages, t],
  );

  const send = useCallback(
    async (attempt: SubmissionAttempt) => {
      if (attemptState.current === "sending") return;
      attemptState.current = "sending";
      setPendingAttempt(null);
      setBusy(true);

      try {
        const created = await submit(attempt);

        try {
          window.localStorage.removeItem(draftKey(attempt.problemCode, attempt.languageKey));
        } catch {
          // Nothing to clean up when storage is unavailable.
        }

        router.push(withContest(`/submission/${created.id}`));
      } catch (thrown) {
        attemptState.current = "idle";
        setBusy(false);
        setError(mutationError(thrown, t("failed")));
      }
    },
    [router, submit, t, withContest],
  );

  const attemptSubmission = useCallback(() => {
    if (attemptState.current !== "idle" || exhausted || !languageKey || !language) return;
    setError(null);

    if (source.trim().length === 0) {
      setError(t("emptySource"));

      return;
    }

    if (source.length > MAX_SOURCE_LENGTH) {
      setError(t("tooLong", { count: MAX_SOURCE_LENGTH }));

      return;
    }

    const attempt = { problemCode, languageKey, source, judgePin: judgePin || undefined };

    if (reminder && eligible && !reminder.acknowledged) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      attemptState.current = "confirming";
      setPendingAttempt(attempt);
    } else {
      void send(attempt);
    }
  }, [eligible, exhausted, judgePin, language, languageKey, problemCode, reminder, send, source, t]);

  const cancelAttempt = () => {
    if (attemptState.current !== "confirming") return;
    attemptState.current = "idle";
    setPendingAttempt(null);
  };

  const lines = source.length === 0 ? 0 : source.split("\n").length;
  const onlineJudges = (judges?.judges ?? []).filter((judge) => judge.online);

  return (
    <div className="grid gap-4">
      <Dialog
        open={pendingAttempt !== null}
        onOpenChange={(open) => {
          if (!open) cancelAttempt();
        }}
      >
        <DialogContent
          title={t("joinWarningTitle")}
          description={t("joinWarningBody", { contestName: reminder?.name ?? "" })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;

            if (target?.isConnected && target !== document.body) target.focus();
            else submitButton.current?.focus();
          }}
        >
          <DialogFooter>
            <Button variant="secondary" onClick={cancelAttempt}>
              {t("goBack")}
            </Button>
            <Button
              onClick={() => {
                if (attemptState.current === "confirming" && pendingAttempt) void send(pendingAttempt);
              }}
            >
              {t("submitAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {noJudges ? (
        <Alert variant="danger">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("noJudgeTitle")}</AlertTitle>
          <AlertDescription>{t("noJudgeBody")}</AlertDescription>
        </Alert>
      ) : null}

      {submissionsLeft !== null ? (
        <Alert variant={exhausted ? "danger" : "warning"}>
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{t("submissionsLeft", { count: Math.max(0, submissionsLeft) })}</AlertTitle>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="danger" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}

      {/* The whole card takes the drop rather than the editor alone: a file let
          go an inch outside it would otherwise be opened by the browser. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is
          a pointer-only shortcut for the Choose file button beside it, which is
          the keyboard path and the one assistive technology is offered. */}
      <div
        className={`relative flex flex-col overflow-hidden rounded-md border border-border bg-card ${
          compact ? "h-[52dvh]" : "min-h-[60dvh]"
        }`}
        onDragOver={(event) => {
          if (!carriesFile(event.dataTransfer)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          const entered = event.relatedTarget instanceof Node ? event.relatedTarget : null;

          if (!entered || !event.currentTarget.contains(entered)) setDragging(false);
        }}
        onDrop={(event) => {
          if (!carriesFile(event.dataTransfer)) return;
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];

          if (file) void loadFile(file);
        }}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-secondary px-2">
          <LanguagePicker languages={languages} value={languageKey} onChange={setLanguageKey} />
          <Button
            variant="ghost"
            size="sm"
            icon={<Upload size={14} />}
            onClick={() => filePicker.current?.click()}
          >
            {t("chooseFile")}
          </Button>
          <input
            ref={filePicker}
            type="file"
            className="sr-only"
            aria-label={t("chooseFile")}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) void loadFile(file);
              // Cleared so that picking the same file again fires the change.
              event.target.value = "";
            }}
          />
          {fileName ? (
            <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <Paperclip size={13} aria-hidden className="shrink-0" />
              <span className="truncate font-mono">{fileName}</span>
            </span>
          ) : null}
          {/* First thing to go when the row runs out of room: the picker and
              the file button are what a narrow screen needs from this row. */}
          <span className="ml-auto shrink-0 font-mono text-sm tabular-nums text-muted-foreground max-sm:hidden">
            {lines.toLocaleString("en-AU")} × {source.length.toLocaleString("en-AU")}
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <CodeEditor
            value={source}
            onChange={(next) => {
              touched.current = true;
              setSource(next);
            }}
            onSubmit={attemptSubmission}
            editorMode={language?.editorMode ?? "text"}
            ariaLabel={t("sourceLabel", { name: problemName })}
            className="h-full"
          />
        </div>

        <div className="flex h-12 shrink-0 items-center gap-3 border-t border-border bg-secondary px-3">
          {canPinJudge ? (
            <Select
              ariaLabel={t("judge")}
              size="sm"
              className="w-40 bg-card"
              placeholder={t("anyJudge")}
              value={judgePin || "__any__"}
              onValueChange={(value) => setJudgePin(value === "__any__" ? "" : value)}
              options={[
                { value: "__any__", label: t("anyJudge") },
                ...onlineJudges.map((judge) => ({ value: judge.name, label: judge.name })),
              ]}
            />
          ) : null}
          <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground max-sm:hidden">
            {t.rich("hint", {
              keys: () => (
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Enter</Kbd>
                </KbdGroup>
              ),
            })}
          </span>
          <Button
            ref={submitButton}
            onClick={attemptSubmission}
            busy={busy}
            disabled={exhausted || !language || !!pendingAttempt}
          >
            {t("submit")}
          </Button>
        </div>

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-2 flex items-center justify-center bg-card/85">
            <span className="rounded-md border-2 border-dashed border-primary px-6 py-4 text-base font-medium text-foreground">
              {t("dropHere")}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
