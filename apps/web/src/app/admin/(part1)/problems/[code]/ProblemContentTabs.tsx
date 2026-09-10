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
      setReasonError("Say what you changed so the revision is worth reading.");
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
      toast.success("Editorial saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  async function remove() {
    setConfirmDelete(false);
    try {
      await deleteEditorial({ code: problem.code, reason: reason.trim() || "Removed the editorial." });
      setContent("");
      toast.success("Editorial removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />

      <AdminSection title="Editorial">
        <Field label="Authors" htmlFor={ids.authors} hint="Credited under the editorial.">
          <UserPicker id={ids.authors} values={authors} onChange={setAuthors} ariaLabel="Editorial authors" />
        </Field>
        <Field
          label="Publish on"
          htmlFor={ids.publishOn}
          hint="Solvers see it from this moment; staff always do."
        >
          <DateTimeField
            id={ids.publishOn}
            value={publishOn}
            onChange={setPublishOn}
            ariaLabel="Editorial publish date"
          />
        </Field>
        <AdminCheckField
          label="Public"
          hint="Unpublished editorials stay visible to the problem's staff."
          checked={isPublic}
          onCheckedChange={setIsPublic}
        />
      </AdminSection>

      <Panel title="Solution" bodyClassName="p-4">
        <Field label="Editorial" hint="Markdown, the same pipeline as a statement.">
          <MarkdownEditor value={content} onChange={setContent} preset="solution" rows={22} />
        </Field>
      </Panel>

      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="editorial" />
      <AdminFormFooter
        busy={busy}
        submitLabel={editorial ? "Save editorial" : "Add editorial"}
        secondary={
          editorial ? (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              Remove editorial
            </Button>
          ) : undefined
        }
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the editorial for {problem.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The solution text is deleted. The problem itself and its submissions are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove editorial</AlertDialogAction>
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
      setError("A translation needs a language code, for example fr or zh-hans.");
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
      toast.success(`The ${language} translation was saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <Panel title={`Translations (${problem.translations.length})`} bodyClassName="p-0">
        {problem.translations.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={<Languages aria-hidden />}
            title="No translations"
            description="A translation replaces the name and statement for readers using that language."
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead>Name</TableHead>
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
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove the ${row.language} translation`}
                        onClick={async () => {
                          await deleteTranslation({ code: problem.code, language: row.language });
                          toast.success(`The ${row.language} translation was removed.`);
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
        <AdminSection title={existing ? `Edit the ${language} translation` : "Add a translation"}>
          <Field label="Language code" htmlFor={ids.language} hint="As in fr, zh-hans, vi.">
            <Input
              id={ids.language}
              mono
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="fr"
            />
          </Field>
          <Field label="Translated name" htmlFor={ids.name}>
            <Input id={ids.name} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </AdminSection>
        <Panel title="Translated statement" bodyClassName="p-4">
          <Field label="Statement">
            <MarkdownEditor value={description} onChange={setDescription} preset="problem" rows={18} />
          </Field>
        </Panel>
        <ReasonField value={reason} onChange={setReason} entity="translation" />
        <AdminFormFooter busy={busy} submitLabel={existing ? "Save translation" : "Add translation"} />
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
      setReasonError("Say what you changed so the revision is worth reading.");
      return;
    }
    setReasonError(undefined);
    setBusy(true);
    try {
      await setLanguageLimits({ code: problem.code, limits, reason: reason.trim() });
      setReason("");
      toast.success("Language limits saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <AdminForm onSubmit={save}>
      <AdminFormError message={error} />
      <Panel
        title={`Language limits (${limits.length})`}
        bodyClassName="p-0"
        action={
          available.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select
                size="sm"
                ariaLabel="Language to add a limit for"
                value={adding}
                onValueChange={setAdding}
                options={available.map((row) => ({ value: row.key, label: row.name }))}
                placeholder="Add a language"
                className="h-(--control-h-sm) w-[160px]"
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!adding}
                title={adding ? undefined : "Choose a language first."}
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
                Add
              </Button>
            </div>
          ) : null
        }
      >
        {limits.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={<Languages aria-hidden />}
            title="No language limits"
            description={`Every language runs at ${problem.timeLimit}s and ${problem.memoryLimit} KB. Add a row to give one language more room.`}
          />
        ) : (
          <Table dense className="group/table" scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead numeric>Time limit (s)</TableHead>
                <TableHead numeric>Memory limit (KB)</TableHead>
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
                      aria-label={`Time limit for ${limit.languageKey}`}
                      value={String(limit.timeLimit)}
                      onChange={(event) => patch(index, { timeLimit: Number(event.target.value) || 0 })}
                      className="ml-auto h-(--control-h-sm) w-[92px] text-right"
                    />
                  </TableCell>
                  <TableCell numeric>
                    <Input
                      mono
                      inputMode="numeric"
                      aria-label={`Memory limit for ${limit.languageKey}`}
                      value={String(limit.memoryLimit)}
                      onChange={(event) => patch(index, { memoryLimit: Number(event.target.value) || 0 })}
                      className="ml-auto h-(--control-h-sm) w-[120px] text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove the ${limit.languageKey} limit`}
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
      <ReasonField value={reason} onChange={setReason} error={reasonError} entity="limit" />
      <AdminFormFooter busy={busy} submitLabel="Save language limits" />
    </AdminForm>
  );
}

/* -------------------------------------------------------------------------- */
/* Clarifications                                                             */
/* -------------------------------------------------------------------------- */

export function ProblemClarificationsTab({ problem }: { problem: ProblemEdit }) {
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
      setError("A clarification needs something to say.");
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
      toast.success("Clarification posted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change was refused.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <Panel title={`Clarifications (${problem.clarifications.length})`} bodyClassName="p-0">
        {problem.clarifications.length === 0 ? (
          <EmptyState
            className="rounded-none border-0"
            icon={<MessageSquare aria-hidden />}
            title="No clarifications"
            description="A clarification appears above the statement for everyone reading the problem."
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
                    aria-label="Remove this clarification"
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
        <Panel title="New clarification" bodyClassName="p-4">
          <Field label="Clarification" hint="Markdown, shown above the statement.">
            <MarkdownEditor value={description} onChange={setDescription} preset="comment" rows={6} />
          </Field>
        </Panel>
        <ReasonField value={reason} onChange={setReason} entity="clarification" />
        <AdminFormFooter busy={busy} submitLabel="Post clarification" busyLabel="Posting…" />
      </AdminForm>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this clarification?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the problem page for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pending) return;
                await deleteClarification({
                  code: problem.code,
                  clarificationId: pending as Id<"problemClarifications">,
                });
                setPending(null);
                toast.success("Clarification removed.");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
