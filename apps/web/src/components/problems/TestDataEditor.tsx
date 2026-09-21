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
import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { mutationError } from "@/lib/convex-error";
import { formatDateTime } from "@/lib/format";
import { formatMemory } from "@/lib/submissionFormat";

/** `judge/models/problem_data.py::CHECKERS`, in DMOJ's order. */
const CHECKERS = [
  { value: "__none__", key: "default" },
  { value: "standard", key: "standard" },
  { value: "floats", key: "floats" },
  { value: "floatsabs", key: "floatsAbsolute" },
  { value: "floatsrel", key: "floatsRelative" },
  { value: "rstripped", key: "nonTrailingSpaces" },
  { value: "sorted", key: "sorted" },
  { value: "identical", key: "byteIdentical" },
  { value: "linecount", key: "lineByLine" },
] as const;

const CASE_TYPES = [
  { value: "C", key: "normal" },
  { value: "S", key: "batchStart" },
  { value: "E", key: "batchEnd" },
] as const;

type Payload = NonNullable<(typeof api.problems.data.get)["_returnType"]>;

/** A row the editor holds. One the member has just added has no database id
 *  yet, and `saveCases` rewrites the whole set anyway. */
type CaseRow = Omit<Payload["cases"][number], "id"> & {
  key: string;
  id?: Payload["cases"][number]["id"];
};

/** Convex's upload endpoint answers `{storageId}`. The id's brand is nominal, so
 *  a present string is as far as a runtime check can go. */
function isUploadAnswer(body: unknown): body is { storageId: Id<"_storage"> } {
  return (
    typeof body === "object" && body !== null && "storageId" in body && typeof body.storageId === "string"
  );
}

function caseType(value: string): CaseRow["type"] | null {
  return CASE_TYPES.find((type) => type.value === value)?.value ?? null;
}

const OPTIONAL_COLUMNS = [
  "outputPrefix",
  "outputLimit",
  "checker",
  "generatorArgs",
  "batchDependencies",
] as const;

type ColumnKey = (typeof OPTIONAL_COLUMNS)[number];

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed === "") return null;
  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

export function TestDataEditor({ code, initial }: { code: string; initial: Payload }) {
  const t = useTranslations("problems.testData");
  const actions = useTranslations("common.actions");
  const live = useQuery(api.problems.data.get, { code });
  const data = live ?? initial;

  const generateUploadUrl = useMutation(api.problems.data.generateUploadUrl);
  const updateData = useMutation(api.problems.data.updateData);
  const saveCases = useMutation(api.problems.data.saveCases);
  const publishArchive = useAction(api.problems.data.publishArchive);

  const published = data.published;

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

  const preview = useQuery(api.problems.data.initYaml, { code, files: files.length > 0 ? files : undefined });

  function patch(key: string, change: Partial<CaseRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function move(index: number, delta: number) {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;

      if (target < 0 || target >= next.length) return current;
      const a = next[index];
      const b = next[target];

      if (a === undefined || b === undefined) return current;
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
      setError(mutationError(thrown, t("saveFailed")));
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
      const answer: unknown = await response.json();

      if (!isUploadAnswer(answer)) throw new Error("the upload endpoint returned no storage id");
      const { storageId } = answer;
      const result = await publishArchive({ code, zipfile: file.name, storageId });
      setFiles(result.files);
      setStatus(
        result.changed
          ? t("archivePublished", {
              file: file.name,
              count: result.fileCount,
              hash: result.hash.slice(0, 12),
            })
          : t("archiveUnchanged", { file: file.name }),
      );
    });
  }

  const fileOptions = files.map((name) => ({ value: name, label: name }));
  const checkers = CHECKERS.map((checker) => ({ value: checker.value, label: t(`checkers.${checker.key}`) }));
  const caseTypes = CASE_TYPES.map((type) => ({ value: type.value, label: t(`caseTypes.${type.key}`) }));

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
      {published ? (
        <Panel title={t("publishedTitle")} bodyClassName="p-3">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-sm text-muted-foreground">{t("hash")}</dt>
            <dd className="font-mono text-mono break-all">{published.hash}</dd>
            <dt className="text-sm text-muted-foreground">{t("size")}</dt>
            <dd className="text-sm">
              {t("sizeSummary", {
                size: formatMemory(published.size / 1024),
                count: published.fileCount,
              })}
            </dd>
            <dt className="text-sm text-muted-foreground">{t("published")}</dt>
            <dd className="text-sm">
              {published.uploadedByUsername
                ? t("publishedBy", {
                    when: formatDateTime(published.uploadedAt),
                    who: published.uploadedByUsername,
                  })
                : formatDateTime(published.uploadedAt)}
            </dd>
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">{t("publishedNote")}</p>
        </Panel>
      ) : null}

      <fieldset className="contents">
        <Panel title={t("problemDataTitle")} bodyClassName="grid gap-4 p-3">
          <Field
            label={t("zipLabel")}
            htmlFor="zipfile"
            hint={
              published
                ? t("zipHolding", {
                    count: published.fileCount,
                    hash: published.hash.slice(0, 12),
                  })
                : data.data?.zipfile
                  ? t("zipCurrent", { file: data.data.zipfile })
                  : t("zipNone")
            }
          >
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<Upload size={14} />}
                busy={busy}
                onClick={() => filePicker.current?.click()}
              >
                {t("chooseZip")}
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
            <Field label={t("generator")} htmlFor="generator">
              <Input
                id="generator"
                mono
                value={form.generator}
                placeholder="generator.cpp"
                onChange={(event) => setForm({ ...form, generator: event.target.value })}
              />
            </Field>
            <Field label={t("checker")} htmlFor="checker">
              <Select
                id="checker"
                ariaLabel={t("checker")}
                value={form.checker || "__none__"}
                onValueChange={(value) => setForm({ ...form, checker: value === "__none__" ? "" : value })}
                options={checkers}
              />
            </Field>
            <Field label={t("outputPrefixLength")} htmlFor="output-prefix">
              <Input
                id="output-prefix"
                type="number"
                mono
                value={form.outputPrefix}
                onChange={(event) => setForm({ ...form, outputPrefix: event.target.value })}
              />
            </Field>
            <Field label={t("outputLimitLength")} htmlFor="output-limit">
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
            <Field label={t("checkerArgs")} htmlFor="checker-args" hint={t("checkerArgsHint")}>
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
              label={t("enableUnicode")}
            />
            <Switch
              id="nobigmath"
              checked={form.nobigmath}
              onCheckedChange={(next) => setForm({ ...form, nobigmath: next })}
              label={t("disableBigMath")}
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
                  setStatus(t("dataSaved"));
                })
              }
            >
              {t("saveData")}
            </Button>
          </div>
        </Panel>

        <Panel
          title={t("casesTitle")}
          bodyClassName="p-0"
          action={
            <span className="flex items-center gap-3">
              {OPTIONAL_COLUMNS.map((column) => (
                <Checkbox
                  key={column}
                  id={`show-${column}`}
                  checked={visible[column]}
                  onCheckedChange={(next) => setVisible({ ...visible, [column]: next })}
                  label={t(`columns.${column}`)}
                  labelClassName="text-titlebar-ink-2 hover:text-titlebar-ink text-xs"
                />
              ))}
            </span>
          }
        >
          <Table aria-label={t("casesTitle")} dense scrollable={false}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead className="w-36">{t("columns.type")}</TableHead>
                <TableHead>{t("columns.inputFile")}</TableHead>
                <TableHead>{t("columns.outputFile")}</TableHead>
                <TableHead numeric className="w-20">
                  {t("columns.points")}
                </TableHead>
                <TableHead className="w-20">{t("columns.pretest")}</TableHead>
                {visible.outputPrefix ? (
                  <TableHead className="w-24">{t("columns.outputPrefix")}</TableHead>
                ) : null}
                {visible.outputLimit ? (
                  <TableHead className="w-24">{t("columns.outputLimit")}</TableHead>
                ) : null}
                {visible.checker ? <TableHead className="w-40">{t("columns.checker")}</TableHead> : null}
                {visible.generatorArgs ? (
                  <TableHead className="w-40">{t("columns.generatorArgs")}</TableHead>
                ) : null}
                {visible.batchDependencies ? (
                  <TableHead className="w-32">{t("columns.batchDependencies")}</TableHead>
                ) : null}
                <TableHead className="w-12">
                  <span className="sr-only">{actions("delete")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                    {t("emptyNoCases")}
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
                        <Tooltip content={t("moveUp")}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("moveCaseUp", { index: index + 1 })}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ChevronUp size={12} />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t("moveDown")}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("moveCaseDown", { index: index + 1 })}
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
                        ariaLabel={t("caseType", { index: index + 1 })}
                        value={row.type}
                        onValueChange={(value) => {
                          const type = caseType(value);

                          if (type) patch(row.key, { type });
                        }}
                        options={caseTypes}
                      />
                    </TableCell>
                    <TableCell>
                      {row.type === "C" ? (
                        fileOptions.length > 0 ? (
                          <Select
                            size="sm"
                            ariaLabel={t("caseInputFile", { index: index + 1 })}
                            value={row.inputFile}
                            onValueChange={(value) => patch(row.key, { inputFile: value })}
                            options={fileOptions}
                            placeholder={t("chooseFile")}
                          />
                        ) : (
                          <Input
                            mono
                            value={row.inputFile}
                            aria-label={t("caseInputFile", { index: index + 1 })}
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
                            ariaLabel={t("caseOutputFile", { index: index + 1 })}
                            value={row.outputFile}
                            onValueChange={(value) => patch(row.key, { outputFile: value })}
                            options={fileOptions}
                            placeholder={t("chooseFile")}
                          />
                        ) : (
                          <Input
                            mono
                            value={row.outputFile}
                            aria-label={t("caseOutputFile", { index: index + 1 })}
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
                          aria-label={t("casePoints", { index: index + 1 })}
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
                          aria-label={t("casePretest", { index: index + 1 })}
                        />
                      )}
                    </TableCell>
                    {visible.outputPrefix ? (
                      <TableCell numeric>
                        <Input
                          type="number"
                          mono
                          className="w-20"
                          aria-label={t("caseOutputPrefix", { index: index + 1 })}
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
                          aria-label={t("caseOutputLimit", { index: index + 1 })}
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
                          ariaLabel={t("caseChecker", { index: index + 1 })}
                          value={row.checker ?? "__none__"}
                          onValueChange={(value) =>
                            patch(row.key, { checker: value === "__none__" ? null : value })
                          }
                          options={checkers}
                        />
                      </TableCell>
                    ) : null}
                    {visible.generatorArgs ? (
                      <TableCell>
                        <Input
                          mono
                          aria-label={t("caseGeneratorArgs", { index: index + 1 })}
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
                          aria-label={t("caseBatchDependencies", { index: index + 1 })}
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
                      <Tooltip content={t("removeCase")}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("removeCaseLabel", { index: index + 1 })}
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
                  setStatus(t("casesSaved"));
                })
              }
            >
              {t("submitCases")}
            </Button>
            <Button
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    key: `new-${Date.now()}`,
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
              {t("addCase")}
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
              {preview.yaml || t("yamlNone")}
            </pre>
          </>
        )}
      </Panel>
    </div>
  );
}
