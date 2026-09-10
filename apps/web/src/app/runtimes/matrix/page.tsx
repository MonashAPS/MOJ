import { api } from "@convex/_generated/api";
import { cn, EmptyState, MicroLabel, TitleRow } from "@moj/ui";
import { ServerOff } from "lucide-react";
import { STATUS_TABS } from "@/components/status/StatusTabs";
import { queryAsViewer } from "@/lib/convex-server";
import { DASH } from "@/lib/submissionFormat";

export const metadata = { title: "Version matrix" };
export const dynamic = "force-dynamic";

/**
 * `version_matrix` (judge/views/status.py:53): one column per online judge (or
 * per collapsed group of identical judges), one row per language, and a cell
 * that says whether that judge is on the newest runtime anyone has.
 */
export default async function VersionMatrixPage() {
  const matrix = await queryAsViewer(api.status.matrix, {});

  if (matrix.judges.length === 0 || matrix.languages.length === 0) {
    return (
      <>
        <TitleRow title="Version matrix" tabs={STATUS_TABS} active="matrix" />
        <div id="content-body">
          <EmptyState
            icon={<ServerOff aria-hidden />}
            title="No judges"
            description="No judges are online, so there are no runtime versions to compare."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <TitleRow title="Version matrix" tabs={STATUS_TABS} active="matrix" />
      <div id="content-body" className="grid gap-3">
        <div className="overflow-hidden overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr>
                <th className="sticky left-0 z-(--z-sticky) h-8 whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                  Language
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
                        title={
                          cell ? (cell.isLatest ? "Newest runtime" : "Behind another judge") : "Not installed"
                        }
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
          <MicroLabel>Key</MicroLabel>
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <span aria-hidden className="size-2.5 rounded-xs bg-good" />
            Newest runtime
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <span aria-hidden className="size-2.5 rounded-xs bg-warn" />
            Behind another judge
          </span>
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <span aria-hidden className="font-mono">
              {DASH}
            </span>
            Not installed
          </span>
        </div>
      </div>
    </>
  );
}
