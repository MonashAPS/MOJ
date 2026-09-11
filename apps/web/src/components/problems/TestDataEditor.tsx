"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  Alert,
  AlertTitle,
  Button,
  Checkbox,
  cn,
  Field,
  FieldGroup,
  Input,
  Panel,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
} from "@moj/ui";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { formatMemory } from "@/lib/submissionFormat";

/** `judge/models/problem_data.py::CHECKERS`, in DMOJ's order. */
const CHECKERS = [
  { value: "__none__", label: "Default" },
  { value: "standard", label: "Standard" },
  { value: "floats", label: "Floats" },
  { value: "floatsabs", label: "Floats (absolute)" },
  { value: "floatsrel", label: "Floats (relative)" },
  { value: "rstripped", label: "Non-trailing spaces" },
  { value: "sorted", label: "Sorted" },
  { value: "identical", label: "Byte identical" },
  { value: "linecount", label: "Line-by-line" },
];

const CASE_TYPES = [
  { value: "C", label: "Normal case" },
  { value: "S", label: "Batch start" },
  { value: "E", label: "Batch end" },
];

type Payload = NonNullable<(typeof api.problemData.get)["_returnType"]>;
type CaseRow = Payload["cases"][number] & { key: string };

const OPTIONAL_COLUMNS = [
  { key: "outputPrefix", label: "Output prefix" },
  { key: "outputLimit", label: "Output limit" },
  { key: "checker", label: "Checker" },
  { key: "generatorArgs", label: "Generator args" },
  { key: "batchDependencies", label: "Batch dependencies" },
] as const;

type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The judge grades from data published elsewhere, so nothing here may be saved. */
const REPOSITORY_OWNED =
  "This problem is graded from data held on the judge, published from a problem repository.";

export function TestDataEditor({ code, initial }: { code: string; initial: Payload }) {
  const live = useQuery(api.problemData.get, { code });
  const data = live ?? initial;

  const generateUploadUrl = useMutation(api.problemData.generateUploadUrl);
  const updateData = useMutation(api.problemData.updateData);
  const saveCases = useMutation(api.problemData.saveCases);
  const publishArchive = useAction(api.problemData.publishArchive);

  const published = data.published;
  // Nothing of this problem's data lives here: a judge reports it and the site
  // holds no archive, so the editor is a read-only explanation of that.
  const readOnly = published === null && data.judgesWithProblem > 0 && data.cases.length === 0;

  const [rows, setRows] = useState<CaseRow[]>(() =>
    data.cases.map((row, index) => ({ ...row, key: `${row.id ?? "new"}-${index}` })),
  );
  const [form, setForm] = useState({
    checker: data.data?.checker ?? "",
    checkerArgs: data.data?.checkerArgs ?? "",
    outputPrefix: data.data?.outputPrefix?.toString() ?? "",
    outputLimit: data.data?.outputLimit?.toString() ?? "",
    unicode: data.data?.unicode ?? false,
    nobigmath: data.data?.nobigmath ?? false,
    generator: data.data?.generator ?? "",
  });
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => ({
    outputPrefix: data.cases.some((row) => row.outputPrefix !== null),
    outputLimit: data.cases.some((row) => row.outputLimit !== null),
    checker: data.cases.some((row) => row.checker !== null),
    generatorArgs: data.cases.some((row) => row.generatorArgs !== ""),
    batchDependencies: data.cases.some((row) => row.batchDependencies.length > 0),
  }));
  const [files, setFiles] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filePicker = useRef<HTMLInputElement>(null);

  const preview = useQuery(api.problemData.initYaml, { code, files: files.length > 0 ? files : undefined });

  function patch(key: string, change: Partial<CaseRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const a = next[index] as CaseRow;
      const b = next[target] as CaseRow;
      next[index] = b;
      next[target] = a;
      return next.map((row, position) => ({ ...row, order: position + 1 }));
    });
  }

  async function withErrors(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await action();
    } catch (thrown) {
      setError(
        thrown instanceof ConvexError && typeof thrown.data === "object" && thrown.data !== null
          ? String((thrown.data as { message?: string }).message ?? "That change was not saved.")
          : "That change was not saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * The zip becomes the site's copy of the problem's grading data, the same
   * archive a problem repository publishes, so judges fetch it rather than
   * holding their own.
   */
  async function upload(file: File) {
    await withErrors(async () => {
      const url = await generateUploadUrl({ code });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/zip" },
        body: file,
      });
      if (!response.ok) throw new Error("upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const result = await publishArchive({ code, zipfile: file.name, storageId });
      setFiles(result.files);
      setStatus(
        result.changed
          ? `${file.name} published — ${result.fileCount} files, ${result.hash.slice(0, 12)}.`
          : `${file.name} is the archive already published, so nothing changed.`,
      );
    });
  }

  const fileOptions = files.map((name) => ({ value: name, label: name }));

  return (
    <div className="grid gap-4">
      {data.data?.feedback ? (
        <Alert variant="warning">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{data.data.feedback}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="danger" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {status ? (
        <Alert variant="info">
          <AlertTitle>{status}</AlertTitle>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert variant="info">
          <AlertTitle>{REPOSITORY_OWNED}</AlertTitle>
        </Alert>
      ) : null}

      {published ? (
        <Panel title="Published test data" bodyClassName="p-3">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-sm text-muted-foreground">Hash</dt>
            <dd className="font-mono text-mono break-all">{published.hash}</dd>
            <dt className="text-sm text-muted-foreground">Size</dt>
            <dd className="text-sm">
              {formatMemory(published.size / 1024)} in {published.fileCount}{" "}
              {published.fileCount === 1 ? "file" : "files"}
            </dd>
            <dt className="text-sm text-muted-foreground">Published</dt>
            <dd className="text-sm">
              {formatDateTime(published.uploadedAt)}
              {published.uploadedByUsername ? ` by ${published.uploadedByUsername}` : ""}
            </dd>
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Judges fetch this archive from the site and grade from it. Uploading a zip below replaces it, as
            publishing from a problem repository does.
          </p>
        </Panel>
      ) : null}

      <fieldset disabled={readOnly} className="contents">
        <Panel title="Problem data" bodyClassName="grid gap-4 p-3">
          <Field
            label="Data zip file"
            htmlFor="zipfile"
            hint={
              readOnly
                ? REPOSITORY_OWNED
                : published
                  ? `The site holds ${published.fileCount} ${published.fileCount === 1 ? "file" : "files"} at ${published.hash.slice(0, 12)}.`
                  : data.data?.zipfile
                    ? `Currently ${data.data.zipfile}.`
                    : "No archive has been uploaded."
            }
          >
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<Upload size={14} />}
                busy={busy}
                onClick={() => filePicker.current?.click()}
              >
                Choose a zip file
              </Button>
              <input
                ref={filePicker}
                id="zipfile"
                type="file"
                accept=".zip"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
            </div>
          </Field>

          <FieldGroup columns={2}>
            <Field label="Generator file" htmlFor="generator">
              <Input
                id="generator"
                mono
                value={form.generator}
                placeholder="generator.cpp"
                onChange={(event) => setForm({ ...form, generator: event.target.value })}
              />
            </Field>
            <Field label="Checker" htmlFor="checker">
              <Select
                id="checker"
                ariaLabel="Checker"
                value={form.checker || "__none__"}
                onValueChange={(value) => setForm({ ...form, checker: value === "__none__" ? "" : value })}
                options={CHECKERS}
              />
            </Field>
            <Field label="Output prefix length" htmlFor="output-prefix">
              <Input
                id="output-prefix"
                type="number"
                mono
                value={form.outputPrefix}
                onChange={(event) => setForm({ ...form, outputPrefix: event.target.value })}
              />
            </Field>
            <Field label="Output limit length" htmlFor="output-limit">
              <Input
                id="output-limit"
                type="number"
                mono
                value={form.outputLimit}
                onChange={(event) => setForm({ ...form, outputLimit: event.target.value })}
              />
            </Field>
          </FieldGroup>

          {form.checker.startsWith("floats") ? (
            <Field
              label="Checker arguments"
              htmlFor="checker-args"
              hint="A JSON object, for example {&quot;precision&quot;: 6}."
            >
              <Input
                id="checker-args"
                mono
                value={form.checkerArgs}
                placeholder='{"precision": 6}'
                onChange={(event) => setForm({ ...form, checkerArgs: event.target.value })}
              />
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Switch
              id="unicode"
              checked={form.unicode}
              onCheckedChange={(next) => setForm({ ...form, unicode: next })}
              label="Enable unicode"
            />
            <Switch
              id="nobigmath"
              checked={form.nobigmath}
              onCheckedChange={(next) => setForm({ ...form, nobigmath: next })}
              label="Disable bigInteger and bigDecimal"
            />
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <Button
              busy={busy}
              onClick={() =>
                void withErrors(async () => {
                  await updateData({
                    code,
                    generator: form.generator || null,
                    outputPrefix: numberOrNull(form.outputPrefix),
                    outputLimit: numberOrNull(form.outputLimit),
                    checker: form.checker || null,
                    checkerArgs: form.checkerArgs,
                    unicode: form.unicode,
                    nobigmath: form.nobigmath,
                    files: files.length > 0 ? files : undefined,
                  });
                  setStatus("Problem data saved.");
                })
              }
            >
              Save problem data
            </Button>
          </div>
        </Panel>

        <Panel
          title="Test cases"
          bodyClassName="p-0"
          action={
            <span className="flex items-center gap-3">
              {OPTIONAL_COLUMNS.map((column) => (
                <Checkbox
                  key={column.key}
                  id={`show-${column.key}`}
                  checked={visible[column.key]}
                  onCheckedChange={(next) => setVisible({ ...visible, [column.key]: next })}
                  label={column.label}
                  labelClassName="text-titlebar-ink-2 hover:text-titlebar-ink text-xs"
                />
              ))}
            </span>
          }
        >
          <Table aria-label="Test cases" dense scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead className="w-36">Type</TableHead>
                <TableHead>Input file</TableHead>
                <TableHead>Output file</TableHead>
                <TableHead numeric className="w-20">
                  Points
                </TableHead>
                <TableHead className="w-20">Pretest</TableHead>
                {visible.outputPrefix ? <TableHead className="w-24">Output prefix</TableHead> : null}
                {visible.outputLimit ? <TableHead className="w-24">Output limit</TableHead> : null}
                {visible.checker ? <TableHead className="w-40">Checker</TableHead> : null}
                {visible.generatorArgs ? <TableHead className="w-40">Generator args</TableHead> : null}
                {visible.batchDependencies ? (
                  <TableHead className="w-32">Batch dependencies</TableHead>
                ) : null}
                <TableHead className="w-12">
                  <span className="sr-only">Delete</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                    {data.judgesWithProblem > 0
                      ? "No test data has been uploaded here. This problem is graded from data held on the judge, published from a problem repository."
                      : "This problem has no test cases yet."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, index) => (
                  <TableRow key={row.key} className={cn(row.type !== "C" && "bg-secondary")}>
                    <TableCell>
                      <span className="flex items-center gap-0.5">
                        <span className="w-5 font-mono text-sm tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                        <Tooltip content="Move up">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move case ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ChevronUp size={12} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Move down">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move case ${index + 1} down`}
                            disabled={index === rows.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ChevronDown size={12} />
                          </Button>
                        </Tooltip>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        size="sm"
                        ariaLabel={`Type of case ${index + 1}`}
                        value={row.type}
                        onValueChange={(value) => patch(row.key, { type: value as CaseRow["type"] })}
                        options={CASE_TYPES}
                      />
                    </TableCell>
                    <TableCell>
                      {row.type === "C" ? (
                        fileOptions.length > 0 ? (
                          <Select
                            size="sm"
                            ariaLabel={`Input file for case ${index + 1}`}
                            value={row.inputFile}
                            onValueChange={(value) => patch(row.key, { inputFile: value })}
                            options={fileOptions}
                            placeholder="Choose a file"
                          />
                        ) : (
                          <Input
                            mono
                            value={row.inputFile}
                            aria-label={`Input file for case ${index + 1}`}
                            onChange={(event) => patch(row.key, { inputFile: event.target.value })}
                          />
                        )
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {row.type === "C" ? (
                        fileOptions.length > 0 ? (
                          <Select
                            size="sm"
                            ariaLabel={`Output file for case ${index + 1}`}
                            value={row.outputFile}
                            onValueChange={(value) => patch(row.key, { outputFile: value })}
                            options={fileOptions}
                            placeholder="Choose a file"
                          />
                        ) : (
                          <Input
                            mono
                            value={row.outputFile}
                            aria-label={`Output file for case ${index + 1}`}
                            onChange={(event) => patch(row.key, { outputFile: event.target.value })}
                          />
                        )
                      ) : null}
                    </TableCell>
                    <TableCell numeric>
                      {row.type === "E" ? null : (
                        <Input
                          type="number"
                          mono
                          className="w-16"
                          aria-label={`Points for case ${index + 1}`}
                          value={row.points ?? ""}
                          onChange={(event) => patch(row.key, { points: numberOrNull(event.target.value) })}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {row.type === "E" ? null : (
                        <Checkbox
                          checked={row.isPretest}
                          onCheckedChange={(next) => patch(row.key, { isPretest: next })}
                          aria-label={`Case ${index + 1} is a pretest`}
                        />
                      )}
                    </TableCell>
                    {visible.outputPrefix ? (
                      <TableCell numeric>
                        <Input
                          type="number"
                          mono
                          className="w-20"
                          aria-label={`Output prefix for case ${index + 1}`}
                          value={row.outputPrefix ?? ""}
                          onChange={(event) =>
                            patch(row.key, { outputPrefix: numberOrNull(event.target.value) })
                          }
                        />
                      </TableCell>
                    ) : null}
                    {visible.outputLimit ? (
                      <TableCell numeric>
                        <Input
                          type="number"
                          mono
                          className="w-20"
                          aria-label={`Output limit for case ${index + 1}`}
                          value={row.outputLimit ?? ""}
                          onChange={(event) =>
                            patch(row.key, { outputLimit: numberOrNull(event.target.value) })
                          }
                        />
                      </TableCell>
                    ) : null}
                    {visible.checker ? (
                      <TableCell>
                        <Select
                          size="sm"
                          ariaLabel={`Checker for case ${index + 1}`}
                          value={row.checker ?? "__none__"}
                          onValueChange={(value) =>
                            patch(row.key, { checker: value === "__none__" ? null : value })
                          }
                          options={CHECKERS}
                        />
                      </TableCell>
                    ) : null}
                    {visible.generatorArgs ? (
                      <TableCell>
                        <Input
                          mono
                          aria-label={`Generator arguments for case ${index + 1}`}
                          value={row.generatorArgs}
                          onChange={(event) => patch(row.key, { generatorArgs: event.target.value })}
                        />
                      </TableCell>
                    ) : null}
                    {visible.batchDependencies ? (
                      <TableCell>
                        <Input
                          mono
                          placeholder="1, 2"
                          aria-label={`Batch dependencies for case ${index + 1}`}
                          value={row.batchDependencies.join(", ")}
                          onChange={(event) =>
                            patch(row.key, {
                              batchDependencies: event.target.value
                                .split(",")
                                .map((piece) => Number(piece.trim()))
                                .filter((value) => Number.isFinite(value)),
                            })
                          }
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Tooltip content="Remove this case">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove case ${index + 1}`}
                          onClick={() =>
                            setRows((current) =>
                              current
                                .filter((entry) => entry.key !== row.key)
                                .map((entry, position) => ({ ...entry, order: position + 1 })),
                            )
                          }
                        >
                          <Trash2 size={12} />
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center gap-2 border-t border-border p-3">
            <Button
              busy={busy}
              onClick={() =>
                void withErrors(async () => {
                  await saveCases({
                    code,
                    cases: rows.map((row, index) => ({
                      order: index + 1,
                      type: row.type,
                      inputFile: row.inputFile,
                      outputFile: row.outputFile,
                      generatorArgs: row.generatorArgs,
                      points: row.points,
                      isPretest: row.isPretest,
                      outputPrefix: row.outputPrefix,
                      outputLimit: row.outputLimit,
                      checker: row.checker,
                      checkerArgs: row.checkerArgs,
                      batchDependencies: row.batchDependencies,
                    })),
                    files: files.length > 0 ? files : undefined,
                  });
                  setStatus("Test cases saved.");
                })
              }
            >
              Submit!
            </Button>
            <Button
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    key: `new-${Date.now()}`,
                    id: undefined as unknown as CaseRow["id"],
                    order: current.length + 1,
                    type: "C",
                    inputFile: "",
                    outputFile: "",
                    generatorArgs: "",
                    points: null,
                    isPretest: false,
                    outputPrefix: null,
                    outputLimit: null,
                    checker: null,
                    checkerArgs: "",
                    batchDependencies: [],
                  },
                ])
              }
            >
              Add new case
            </Button>
          </div>
        </Panel>
      </fieldset>

      <Panel title="init.yml" bodyClassName="p-0">
        {preview === undefined ? null : (
          <>
            {preview.feedback ? (
              <p className="border-b border-border bg-warning-bg px-3 py-2 text-sm text-warning-ink">
                {preview.feedback}
              </p>
            ) : null}
            <pre className="overflow-x-auto bg-code p-3 font-mono text-mono text-foreground">
              {preview.yaml ||
                (data.judgesWithProblem > 0
                  ? "# Nothing is generated here: the judge grades this problem from the\n# init.yml published beside its test data."
                  : "# This problem has no generated configuration yet.")}
            </pre>
          </>
        )}
      </Panel>
    </div>
  );
}
