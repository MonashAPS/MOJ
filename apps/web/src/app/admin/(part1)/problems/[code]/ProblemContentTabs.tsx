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
  Button,
  EmptyState,
  Field,
  Input,
  Panel,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@moj/ui";
import { useMutation } from "convex/react";
import { Languages, MessageSquare, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  AdminCheckField,
  AdminForm,
  AdminFormError,
  AdminFormFooter,
  AdminSection,
  DateTimeField,
  ReasonField,
  UserPicker,
} from "@/components/admin";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { formatDateTime } from "@/lib/format";
import type { ProblemEdit, ProblemOptions } from "./types";

/* -------------------------------------------------------------------------- */
/* Editorial                                                                  */
/* -------------------------------------------------------------------------- */

export function ProblemEditorialTab({ problem }: { problem: ProblemEdit }) {
  const t = useTranslations("admin.problems.content.editorial");
  const shared = useTranslations("admin.problems.shared");
  const commonActions = useTranslations("common.actions");
  const setEditorial = useMutation(api.admin.problems.setEditorial);
  const deleteEditorial = useMutation(api.admin.problems.deleteEditorial);
  const editorial = problem.editorial;

  const ids = { authors: useId(), publishOn: useId() };
  const [content, setContent] = useState(editorial?.content ?? "");
  const [isPublic, setIsPublic] = useState(editorial?.isPublic ?? true);
  const [publishOn, setPublishOn] = useState<number | null>(editorial?.publishOn ?? Date.now());
  const [authors, setAuthors] = useState<string[]>(editorial?.authors ?? []);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setError(null);
    if (!reason.trim()) {
      setReasonError(shared("reasonRequired"));
      return;
    }
    setReasonError(undefined);
    setBusy(true);
    try {
      await setEditorial({
        code: problem.code,
        content,
        isPublic,
        publishOn: publishOn ?? Date.now(),
        authors,
        reason: reason.trim(),
      });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
    setBusy(false);
  }

  async function remove() {
    setConfirmDelete(false);
    try {
      await deleteEditorial({ code: problem.code, reason: reason.trim() || "Removed the editorial." });
      setContent("");
      toast.success(t("removed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title={t("panel")}>
        <Field label={shared("field.authors")} htmlFor={ids.authors} hint={t("authorsHint")}>
          <UserPicker id={ids.authors} values={authors} onChange={setAuthors} ariaLabel={t("authorsAria")} />
        </Field>
        <Field label={shared("field.publishOn")} htmlFor={ids.publishOn} hint={t("publishOnHint")}>
          <DateTimeField
            id={ids.publishOn}
            value={publishOn}
            onChange={setPublishOn}
            ariaLabel={t("publishOnAria")}
          />
        </Field>
        <AdminCheckField
          label={shared("field.public")}
          hint={t("publicHint")}
          checked={isPublic}
          onCheckedChange={setIsPublic}
        />
      </AdminSection>

      <Panel title={t("solutionPanel")} bodyClassName="p-4">
        <Field label={t("label")} hint={t("hint")}>
          <MarkdownEditor value={content} onChange={setContent} preset="solution" rows={22} />
        </Field>
      </Panel>

      <ReasonField value={reason} onChange={setReason} error={reasonError} hint={t("reasonHint")} />
      <AdminFormFooter
        busy={busy}
        submitLabel={editorial ? t("save") : t("add")}
        secondary={
          editorial ? (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              {t("remove")}
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { name: problem.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminForm>
  );
}

/* -------------------------------------------------------------------------- */
/* Translations                                                               */
/* -------------------------------------------------------------------------- */

export function ProblemTranslationsTab({ problem }: { problem: ProblemEdit }) {
  const t = useTranslations("admin.problems.content.translations");
  const shared = useTranslations("admin.problems.shared");
  const commonActions = useTranslations("common.actions");
  const setTranslation = useMutation(api.admin.problems.setTranslation);
  const deleteTranslation = useMutation(api.admin.problems.deleteTranslation);

  const ids = { language: useId(), name: useId() };
  const [language, setLanguage] = useState(problem.translations[0]?.language ?? "");
  const existing = problem.translations.find((row) => row.language === language) ?? null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: string) {
    const row = problem.translations.find((entry) => entry.language === next);
    setLanguage(next);
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
  }

  async function save() {
    setError(null);
    if (!language.trim()) {
      setError(t("languageRequired"));
      return;
    }
    setBusy(true);
    try {
      await setTranslation({
        code: problem.code,
        language: language.trim(),
        name,
        description,
        reason: reason.trim() || undefined,
      });
      setReason("");
      toast.success(t("saved", { language }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <Panel title={t("panel", { count: problem.translations.length })} bodyClassName="p-0">
        {problem.translations.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<Languages aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnLanguage")}</TableHead>
                <TableHead>{t("columnName")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {problem.translations.map((row) => (
                <TableRow key={row.language} selected={row.language === language}>
                  <TableCell className="font-mono text-mono">{row.language}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => choose(row.language)}>
                        {commonActions("edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("removeAria", { language: row.language })}
                        onClick={async () => {
                          await deleteTranslation({ code: problem.code, language: row.language });
                          toast.success(t("removed", { language: row.language }));
                        }}
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

      <AdminForm onSubmit={save}>
        <AdminFormError message={error} />
        <AdminSection title={existing ? t("editTitle", { language }) : t("addTitle")}>
          <Field label={t("languageCode")} htmlFor={ids.language} hint={t("languageCodeHint")}>
            <Input
              id={ids.language}
              mono
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder={t("languageCodePlaceholder")}
            />
          </Field>
          <Field label={t("translatedName")} htmlFor={ids.name}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </AdminSection>
        <Panel title={t("statementPanel")} bodyClassName="p-4">
          <Field label={shared("field.statement")}>
            <MarkdownEditor value={description} onChange={setDescription} preset="problem" rows={18} />
          </Field>
        </Panel>
        <ReasonField value={reason} onChange={setReason} hint={t("reasonHint")} />
        <AdminFormFooter busy={busy} submitLabel={existing ? t("save") : t("add")} />
      </AdminForm>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Language limits                                                            */
/* -------------------------------------------------------------------------- */

type Limit = { languageKey: string; timeLimit: number; memoryLimit: number };

export function ProblemLanguageLimitsTab({
  problem,
  options,
}: {
  problem: ProblemEdit;
  options: ProblemOptions | undefined;
}) {
  const t = useTranslations("admin.problems.content.languageLimits");
  const shared = useTranslations("admin.problems.shared");
  const setLanguageLimits = useMutation(api.admin.problems.setLanguageLimits);
  const [limits, setLimits] = useState<Limit[]>(problem.languageLimits);
  const [adding, setAdding] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const languages = options?.languages ?? [];
  const available = languages.filter((row) => !limits.some((limit) => limit.languageKey === row.key));

  function patch(index: number, next: Partial<Limit>) {
    setLimits(limits.map((limit, position) => (position === index ? { ...limit, ...next } : limit)));
  }

  async function save() {
    setError(null);
    if (!reason.trim()) {
      setReasonError(shared("reasonRequired"));
      return;
    }
    setReasonError(undefined);
    setBusy(true);
    try {
      await setLanguageLimits({ code: problem.code, limits, reason: reason.trim() });
      setReason("");
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />
      <Panel title={t("panel", { count: limits.length })} bodyClassName="grid gap-0 p-0">
        {available.length > 0 ? (
          <div className="flex items-center gap-2 border-b border-border p-3">
            <Select
              size="sm"
              ariaLabel={t("addAria")}
              value={adding}
              onValueChange={setAdding}
              options={available.map((row) => ({ value: row.key, label: row.name }))}
              placeholder={t("addPlaceholder")}
              className="h-(--control-h-sm) w-[180px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!adding}
              title={adding ? undefined : t("chooseLanguageFirst")}
              onClick={() => {
                if (!adding) return;
                setLimits([
                  ...limits,
                  {
                    languageKey: adding,
                    timeLimit: problem.timeLimit,
                    memoryLimit: problem.memoryLimit,
                  },
                ]);
                setAdding("");
              }}
            >
              {t("add")}
            </Button>
          </div>
        ) : null}
        {limits.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<Languages aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyDescription", {
              seconds: problem.timeLimit,
              kilobytes: problem.memoryLimit,
            })}
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnLanguage")}</TableHead>
                <TableHead numeric>{t("columnTime")}</TableHead>
                <TableHead numeric>{t("columnMemory")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {limits.map((limit, index) => (
                <TableRow key={limit.languageKey}>
                  <TableCell className="font-mono text-mono">
                    {languages.find((row) => row.key === limit.languageKey)?.name ?? limit.languageKey}
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      mono
                      inputMode="decimal"
                      aria-label={t("timeAria", { language: limit.languageKey })}
                      value={String(limit.timeLimit)}
                      onChange={(event) => patch(index, { timeLimit: Number(event.target.value) || 0 })}
                      className="ml-auto h-(--control-h-sm) w-[92px] text-right"
                    />
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      mono
                      inputMode="numeric"
                      aria-label={t("memoryAria", { language: limit.languageKey })}
                      value={String(limit.memoryLimit)}
                      onChange={(event) => patch(index, { memoryLimit: Number(event.target.value) || 0 })}
                      className="ml-auto h-(--control-h-sm) w-[120px] text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("removeAria", { language: limit.languageKey })}
                      onClick={() => setLimits(limits.filter((_unused, position) => position !== index))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
      <ReasonField value={reason} onChange={setReason} error={reasonError} hint={t("reasonHint")} />
      <AdminFormFooter busy={busy} submitLabel={t("submit")} />
    </AdminForm>
  );
}

/* -------------------------------------------------------------------------- */
/* Clarifications                                                             */
/* -------------------------------------------------------------------------- */

export function ProblemClarificationsTab({ problem }: { problem: ProblemEdit }) {
  const t = useTranslations("admin.problems.content.clarifications");
  const shared = useTranslations("admin.problems.shared");
  const commonActions = useTranslations("common.actions");
  const addClarification = useMutation(api.admin.problems.addClarification);
  const deleteClarification = useMutation(api.admin.problems.deleteClarification);

  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!description.trim()) {
      setError(t("descriptionRequired"));
      return;
    }
    setBusy(true);
    try {
      await addClarification({
        code: problem.code,
        description: description.trim(),
        reason: reason.trim() || undefined,
      });
      setDescription("");
      setReason("");
      toast.success(t("posted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : shared("changeRefused"));
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <Panel title={t("panel", { count: problem.clarifications.length })} bodyClassName="p-0">
        {problem.clarifications.length === 0 ? (
          <EmptyState
            className="m-3"
            icon={<MessageSquare aria-hidden />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <ul className="divide-y divide-border">
            {problem.clarifications.map((row) => (
              <li key={row.id} className="grid gap-1 px-3 py-2">
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-base text-foreground">
                    {row.description}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("removeAria")}
                    onClick={() => setPending(row.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <time
                  dateTime={new Date(row.date).toISOString()}
                  className="font-mono text-sm tabular-nums text-muted-foreground"
                >
                  {formatDateTime(row.date)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AdminForm onSubmit={add}>
        <AdminFormError message={error} />
        <Panel title={t("newPanel")} bodyClassName="p-4">
          <Field label={t("label")} hint={t("hint")}>
            <MarkdownEditor value={description} onChange={setDescription} preset="comment" rows={6} />
          </Field>
        </Panel>
        <ReasonField value={reason} onChange={setReason} hint={t("reasonHint")} />
        <AdminFormFooter busy={busy} submitLabel={t("submit")} busyLabel={t("busy")} />
      </AdminForm>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pending) return;
                await deleteClarification({
                  code: problem.code,
                  clarificationId: pending as Id<"problemClarifications">,
                });
                setPending(null);
                toast.success(t("removed"));
              }}
            >
              {t("confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
