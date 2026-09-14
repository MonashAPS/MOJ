"use client";

import { api } from "@convex/_generated/api";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Kbd,
  KbdGroup,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CodeEditor } from "@/components/problems/CodeEditor";

const MAX_SOURCE_LENGTH = 65_536;

type UsableLanguage = NonNullable<
  (typeof api.languages.usableForProblem)["_returnType"]
>["languages"][number];

function draftKey(code: string, languageKey: string): string {
  return `submit:${code}:${languageKey}`;
}

/** DMOJ orders the select by name; MOJ groups by common name, which is what
 *  `Language.common_name` is for. */
function groupLanguages(languages: UsableLanguage[]): { name: string; items: UsableLanguage[] }[] {
  const groups = new Map<string, UsableLanguage[]>();
  for (const language of languages) {
    const key = language.commonName || language.name;
    const bucket = groups.get(key) ?? [];
    bucket.push(language);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SubmitForm({
  problemCode,
  problemName,
  defaultLanguageKey,
  initialSource = "",
  canPinJudge,
  submissionsLeft,
  sebContestKey = null,
}: {
  problemCode: string;
  problemName: string;
  defaultLanguageKey: string | null;
  initialSource?: string;
  canPinJudge: boolean;
  submissionsLeft: number | null;
  /** Set when the viewer is in a contest locked to Safe Exam Browser. */
  sebContestKey?: string | null;
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
  const touched = useRef(initialSource.length > 0);

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
      // The mutation travels over a websocket, which carries none of the
      // headers Safe Exam Browser attaches. This one fetch is an ordinary HTTP
      // request, so the server can read them and hand back something the
      // mutation will accept. It is minted fresh each time and lasts about a
      // minute.
      let sebTicket: string | undefined;
      if (sebContestKey) {
        const response = await fetch(`/api/seb/ticket?contest=${encodeURIComponent(sebContestKey)}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => null)) as { ticket?: string | null } | null;
        sebTicket = body?.ticket ?? undefined;
      }

      const created = await submit({
        problemCode,
        languageKey,
        source,
        judgePin: judgePin || undefined,
        sebTicket,
      });
      try {
        window.localStorage.removeItem(draftKey(problemCode, languageKey));
      } catch {
        // Nothing to clean up when storage is unavailable.
      }
      router.push(`/submission/${created.id}`);
    } catch (thrown) {
      setBusy(false);
      setError(
        thrown instanceof ConvexError && typeof thrown.data === "object" && thrown.data !== null
          ? String((thrown.data as { message?: string }).message ?? t("failed"))
          : t("failed"),
      );
    }
  }, [busy, judgePin, languageKey, problemCode, router, sebContestKey, source, submit, t]);

  const lines = source.length === 0 ? 0 : source.split("\n").length;
  const groups = groupLanguages(languages);
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

      <div className="flex min-h-[60dvh] flex-col overflow-hidden rounded-md border border-border bg-card">
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-secondary px-2">
          <SelectRoot value={languageKey} onValueChange={setLanguageKey}>
            <SelectTrigger size="sm" aria-label={t("language")} className="w-56 bg-card">
              <SelectValue placeholder={t("language")} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.name}>
                  <SelectLabel>{group.name}</SelectLabel>
                  {group.items.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </SelectRoot>
          <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
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
      </div>
    </div>
  );
}
