import type { VersionMatrix as VersionMatrixData } from "@convex/status";
import { cn, EmptyState, MicroLabel } from "@moj/ui";
import { ServerOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { DASH } from "@/lib/submissionFormat";

/**
 * `version_matrix` (judge/views/status.py:53): one column per online judge (or
 * per collapsed group of identical judges), one row per language, and a cell
 * that says whether that judge is on the newest runtime anyone has.
 */
export function VersionMatrix({ matrix }: { matrix: VersionMatrixData }) {
  const t = useTranslations("status.matrix");

  if (matrix.judges.length === 0 || matrix.languages.length === 0) {
    return (
      <EmptyState
        icon={<ServerOff aria-hidden />}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-hidden overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full border-collapse text-base">
          <thead>
            <tr>
              <th className="sticky left-0 z-(--z-sticky) h-8 whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                {t("language")}
              </th>
              {matrix.judges.map((judge) => (
                <th
                  key={judge}
                  className="h-8 whitespace-nowrap bg-titlebar px-3 text-left align-middle font-mono text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink"
                >
                  {judge}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.languages.map((language) => (
              <tr key={language.key} className="even:bg-zebra hover:bg-row-hover">
                <th className="sticky left-0 h-(--row-h) whitespace-nowrap border-b border-border bg-card px-3 text-left align-middle font-sans text-base font-medium text-foreground">
                  {language.name}
                </th>
                {matrix.judges.map((judge) => {
                  const cell = matrix.matrix[judge]?.[language.key];

                  return (
                    <td
                      key={judge}
                      className={cn(
                        "h-(--row-h) whitespace-nowrap border-b border-border px-3 align-middle font-mono text-mono tabular-nums",
                        !cell
                          ? "text-muted-foreground"
                          : cell.isLatest
                            ? "bg-good-bg text-good"
                            : "bg-warn-bg text-warn",
                      )}
                      title={cell ? (cell.isLatest ? t("newest") : t("behind")) : t("missing")}
                    >
                      {cell ? (
                        <span className="grid">
                          {cell.runtimes.map((runtime) => (
                            <span key={`${runtime.name}-${runtime.version}`}>
                              {runtime.name}
                              {runtime.version ? ` ${runtime.version}` : ""}
                            </span>
                          ))}
                        </span>
                      ) : (
                        DASH
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Colour is never the only signal, so the two states are named. */}
      <div className="flex flex-wrap items-center gap-4">
        <MicroLabel>{t("key")}</MicroLabel>
        <span className="inline-flex items-center gap-2 text-sm text-subtle">
          <span aria-hidden className="size-2.5 rounded-xs bg-good" />
          {t("newest")}
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-subtle">
          <span aria-hidden className="size-2.5 rounded-xs bg-warn" />
          {t("behind")}
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-subtle">
          <span aria-hidden className="font-mono">
            {DASH}
          </span>
          {t("missing")}
        </span>
      </div>
    </div>
  );
}
