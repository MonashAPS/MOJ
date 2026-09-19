"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AUDIENCES, type AudiencePolicy, FILE_MOMENTS, PROBLEM_AUDIENCES } from "@moj/core";
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AudienceSelect } from "@/components/audiences/AudienceSelect";
import { formatBytes, formatDateTime } from "@/lib/format";
import { AdminFormError } from "./AdminForm";
import { ConfirmAction } from "./console";

/**
 * Files attached to a contest or a problem: an editorial, a printed booklet,
 * data too big for the statement. Each is uploaded straight to storage and
 * then recorded with its audience.
 */

export type ArtefactOwner = { kind: "contest"; key: string } | { kind: "problem"; code: string };

/** Convex's upload endpoint answers `{storageId}`. */
function isUploadAnswer(body: unknown): body is { storageId: Id<"_storage"> } {
  return (
    typeof body === "object" && body !== null && "storageId" in body && typeof body.storageId === "string"
  );
}

export function ArtefactsEditor({ owner }: { owner: ArtefactOwner }) {
  const t = useTranslations("admin.components.artefacts");
  const files = useQuery(api.admin.artefacts.list, { owner });
  const uploadUrl = useMutation(api.admin.artefacts.uploadUrl);
  const add = useMutation(api.admin.artefacts.add);
  const update = useMutation(api.admin.artefacts.update);
  const remove = useMutation(api.admin.artefacts.remove);
  const picker = useRef<HTMLInputElement>(null);
  const [next, setNext] = useState<AudiencePolicy>({ audiences: ["everyone"], from: "start" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A problem has nobody to join or watch it and no end to wait for.
  const offered = owner.kind === "contest" ? AUDIENCES : PROBLEM_AUDIENCES;
  const moments = owner.kind === "contest" ? FILE_MOMENTS : [];

  async function upload(file: File) {
    setError(null);
    setBusy(true);

    try {
      const url = await uploadUrl({ owner });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!response.ok) throw new Error(t("uploadFailed"));
      const answer: unknown = await response.json();

      if (!isUploadAnswer(answer)) throw new Error(t("uploadFailed"));
      await add({
        owner,
        storageId: answer.storageId,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        audiences: [...next.audiences],
        from: next.from,
      });
      toast.success(t("added", { name: file.name }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("uploadFailed"));
    }

    setBusy(false);
  }

  async function retarget(id: Id<"artefacts">, policy: AudiencePolicy) {
    try {
      await update({ id, audiences: [...policy.audiences], from: policy.from });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
  }

  async function drop(id: Id<"artefacts">, name: string) {
    try {
      await remove({ id });
      toast.success(t("removed", { name }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    }
  }

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />

      <Panel
        title={t("uploadTitle")}
        bodyClassName="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
      >
        <AudienceSelect value={next} offered={offered} moments={moments} onChange={setNext} />
        <div>
          <Button
            variant="secondary"
            icon={<Upload size={14} />}
            busy={busy}
            onClick={() => picker.current?.click()}
          >
            {t("choose")}
          </Button>
          <input
            ref={picker}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </div>
      </Panel>

      {files === undefined ? null : files.length === 0 ? (
        <EmptyState
          icon={<Paperclip aria-hidden />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
        <Panel title={t("listTitle", { count: files.length })} bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columnName")}</TableHead>
                <TableHead>{t("columnSize")}</TableHead>
                <TableHead>{t("columnAudience")}</TableHead>
                <TableHead>{t("columnUploaded")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <span className="font-medium text-foreground">{file.name}</span>
                    <Badge variant="neutral" rounding="pill" mono className="ml-2">
                      {file.contentType}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>{formatBytes(file.size)}</TableCell>
                  <TableCell>
                    <AudienceSelect
                      value={{ audiences: file.audiences, from: file.from }}
                      offered={offered}
                      moments={moments}
                      onChange={(policy) => void retarget(file.id, policy)}
                      className="min-w-56"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {formatDateTime(file.uploadedAt)}
                      {file.uploadedBy ? ` · ${file.uploadedBy}` : ""}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <ConfirmAction
                      title={t("removeTitle", { name: file.name })}
                      description={t("removeDescription")}
                      confirmLabel={t("remove")}
                      onConfirm={() => drop(file.id, file.name)}
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={14} />}
                          aria-label={t("remove")}
                        />
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
