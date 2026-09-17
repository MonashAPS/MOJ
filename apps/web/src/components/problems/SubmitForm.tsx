"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertDescription, AlertTitle, Button, Kbd, KbdGroup, Select } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Paperclip, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/problems/CodeEditor";
import { LanguagePicker } from "@/components/problems/LanguagePicker";
import { mutationError } from "@/lib/convex-error";
import { languageForFile, MAX_SOURCE_LENGTH, readSourceFile } from "@/lib/submit-file";

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
}: {
  problemCode: string;
  problemName: string;
  defaultLanguageKey: string | null;
  initialSource?: string;
  canPinJudge: boolean;
  submissionsLeft: number | null;
  /** Shorter, for the submit dialog the contest's problem list opens. */
  compact?: boolean;
}) {
  const t = useTranslations("problems.submit");
  const router = useRouter();
  const usable = useQuery(api.languages.usableForProblem, { code: problemCode });
  const judges = useQuery(api.judges.list, canPinJudge ? {} : "skip");
  const submit = useMutation(api.submissions.submit);

  const [languageKey, setLanguageKey] = useState(defaultLanguageKey ?? "");
  const [source, setSource] = useState(initialSource);
  const [judgePin, setJudgePin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const touched = useRef(initialSource.length > 0);
  const filePicker = useRef<HTMLInputElement>(null);

  const template = useQuery(api.problems.languageTemplate, languageKey ? { languageKey } : "skip");

  const languages = usable?.languages ?? [];
  const language = languages.find((row) => row.key === languageKey) ?? null;
  const noJudges = usable !== undefined && usable !== null && usable.onlineJudges === 0;
  const exhausted = submissionsLeft !== null && submissionsLeft <= 0;

  // The member's default first; then something a judge can actually run; then
  // the two most common languages, so a fresh account never lands on Ada.
  useEffect(() => {
    if (languageKey || languages.length === 0) return;

    const pick =
      languages.find((row) => row.key === defaultLanguageKey) ??
      languages.find((row) => row.runnable) ??
      languages.find((row) => row.commonName === "C++") ??
      languages.find((row) => row.commonName === "Python") ??
      languages[0];

    if (pick) setLanguageKey(pick.key);
  }, [defaultLanguageKey, languageKey, languages]);

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

  const send = useCallback(async () => {
    if (busy) return;
    setError(null);

    if (source.trim().length === 0) {
      setError(t("emptySource"));

      return;
    }

    if (source.length > MAX_SOURCE_LENGTH) {
      setError(t("tooLong", { count: MAX_SOURCE_LENGTH }));

      return;
    }

    setBusy(true);

    try {
      const created = await submit({
        problemCode,
        languageKey,
        source,
        judgePin: judgePin || undefined,
      });

      try {
        window.localStorage.removeItem(draftKey(problemCode, languageKey));
      } catch {
        // Nothing to clean up when storage is unavailable.
      }

      router.push(`/submission/${created.id}`);
    } catch (thrown) {
      setBusy(false);
      setError(mutationError(thrown, t("failed")));
    }
  }, [busy, judgePin, languageKey, problemCode, router, source, submit, t]);

  const lines = source.length === 0 ? 0 : source.split("\n").length;
  const onlineJudges = (judges?.judges ?? []).filter((judge) => judge.online);

  return (
    <div className="grid gap-4">
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
          <span className="ml-auto shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
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
            onSubmit={() => void send()}
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
          <Button onClick={() => void send()} busy={busy} disabled={exhausted || !languageKey}>
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
