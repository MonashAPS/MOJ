"use client";

import { api } from "@convex/_generated/api";
import type { ContestDetail, ParticipationRow } from "@convex/contests";
import {
  Badge,
  cn,
  EmptyState,
  InputGroup,
  InputGroupInput,
  MicroLabel,
  RatingName,
  TitleRow,
  Tooltip,
} from "@moj/ui";
import { useQuery } from "convex/react";
import { Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips } from "@/components/contests/pieces";
import { formatDateTime, formatPoints } from "@/lib/format";
import { contestTabs, joinKindFor } from "../tabs";

const DASH = "—";

function cellSkin(state: string): string {
  const base = state.replace("pretest-", "");
  if (base === "full-score") return "bg-(--cell-solved-bg) text-(--cell-solved-ink)";
  if (base === "partial-score") return "bg-warn-bg text-warn";
  if (base === "failed-score") return "bg-(--cell-failed-bg) text-(--cell-failed-ink)";
  return "text-(--cell-empty-ink)";
}

/**
 * `ContestParticipationList` (contests.py:785): every run a user has made at
 * this contest, live and virtual, on the same cells the ranking table uses.
 */
export function ParticipationsClient({
  contestKey,
  detail,
  initial,
  viewerUsername,
  subject,
  isOwn,
}: {
  contestKey: string;
  detail: ContestDetail;
  initial: ParticipationRow[] | null;
  viewerUsername: string | null;
  subject: string | null;
  isOwn: boolean;
}) {
  const router = useRouter();
  const [lookup, setLookup] = useState("");
  const live = useQuery(api.contests.participations, isOwn ? { key: contestKey } : "skip");
  const liveOther = useQuery(
    api.contests.participationsOfUser,
    !isOwn && subject ? { key: contestKey, username: subject } : "skip",
  );
  const rows = (isOwn ? live : liveOther) ?? initial;
  const contest = detail.contest;
  const joinKind = joinKindFor(detail);
  const precision = contest?.pointsPrecision ?? 2;

  const labels = detail.problems.map((problem) => problem.label);

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? "Participation"}
            {contest ? (
              <ContestChips
                isVisible={contest.isVisible}
                isPrivate={contest.isPrivate}
                isOrganizationPrivate={contest.isOrganizationPrivate}
                isRated={contest.isRated}
                organizations={contest.organizations}
                tags={contest.tags}
              />
            ) : null}
          </span>
        }
        tabs={contestTabs(detail, contestKey, viewerUsername)}
        active="participation"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-base text-subtle">
            {isOwn ? "Your runs at this contest." : `${subject}'s runs at this contest.`}
          </p>
          {detail.viewer.canSeeFullScoreboard ? (
            <form
              className="grid gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (lookup.trim()) {
                  router.push(`/contest/${contestKey}/participations/${lookup.trim()}/`);
                }
              }}
            >
              <MicroLabel>View user participation</MicroLabel>
              <InputGroup className="h-(--control-h-sm) w-[220px]" leading={<Search size={14} aria-hidden />}>
                <InputGroupInput
                  name="user"
                  type="search"
                  value={lookup}
                  placeholder="Username"
                  onChange={(event) => setLookup(event.target.value)}
                  className="text-[16px] md:text-base"
                />
              </InputGroup>
            </form>
          ) : null}
        </div>

        {rows === null || rows === undefined ? (
          rows === null ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="No participation"
              description={
                isOwn
                  ? "You have not taken part in this contest."
                  : `${subject} has not taken part in this contest.`
              }
            />
          ) : null
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users aria-hidden />}
            title="No participation"
            description={
              isOwn
                ? "You have not taken part in this contest."
                : `${subject} has not taken part in this contest.`
            }
          />
        ) : (
          <div className="overflow-hidden overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full border-collapse text-base [&_tbody_tr:nth-child(even)]:bg-zebra [&_tbody_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th className="h-8 whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                    Run
                  </th>
                  <th className="h-8 w-full whitespace-nowrap bg-titlebar px-3 text-left align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                    Started
                  </th>
                  {labels.map((label) => (
                    <th
                      key={label}
                      className="h-8 w-11 min-w-11 bg-titlebar px-1 text-center align-middle font-mono text-sm font-semibold text-titlebar-ink"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="h-8 whitespace-nowrap bg-titlebar px-3 text-right align-middle font-sans text-xs font-semibold uppercase leading-none tracking-label text-titlebar-ink">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className={cn(
                      "hover:bg-row-hover",
                      row.isDisqualified && "text-muted-foreground line-through decoration-1",
                    )}
                  >
                    <td className="h-(--row-h-dense) whitespace-nowrap border-b border-border px-3 align-middle">
                      <span className="flex items-center gap-2">
                        <RatingName
                          username={row.user.username}
                          displayName={row.user.displayName}
                          rating={row.user.rating}
                          href={`/user/${row.user.username}/`}
                          isAdmin={row.user.displayRank === "admin"}
                          className="text-sm"
                        />
                        {row.virtual > 0 ? (
                          <Badge variant="neutral" shape="square" mono>
                            {`virtual #${row.virtual}`}
                          </Badge>
                        ) : (
                          <Badge variant="accent" shape="square" mono>
                            live
                          </Badge>
                        )}
                        {row.isDisqualified ? (
                          <Badge variant="bad" shape="square" mono>
                            DQ
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="h-(--row-h-dense) whitespace-nowrap border-b border-border px-3 align-middle font-mono text-sm tabular-nums text-muted-foreground">
                      {formatDateTime(row.realStart)}
                      {row.ended ? "" : " · still running"}
                    </td>
                    {row.problems.map((cell, index) => (
                      <td
                        // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                        key={`${row._id}-${index}`}
                        className={cn(
                          "h-(--row-h-dense) w-11 min-w-11 border-b border-border px-1 text-center align-middle",
                          cell ? cellSkin(cell.state) : "text-(--cell-empty-ink)",
                        )}
                        title={
                          cell ? [cell.pointsText, cell.timeText].filter(Boolean).join(" · ") : undefined
                        }
                      >
                        {cell ? (
                          <>
                            <span className="block font-mono text-sm font-medium tabular-nums leading-tight">
                              {cell.pointsText}
                            </span>
                            {cell.timeText ? (
                              <span className="block font-mono text-xs tabular-nums opacity-75">
                                {cell.timeText}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="font-mono text-sm">{DASH}</span>
                        )}
                      </td>
                    ))}
                    <td className="h-(--row-h-dense) whitespace-nowrap border-b border-border px-3 text-right align-middle">
                      {row.isDisqualified ? (
                        <Tooltip content="Disqualified: this run does not score.">
                          <span className="block font-mono text-sm font-semibold tabular-nums leading-tight text-muted-foreground">
                            {DASH}
                          </span>
                        </Tooltip>
                      ) : (
                        <>
                          <Tooltip content={`${formatPoints(row.score, precision)} points`}>
                            <span className="block font-mono text-sm font-semibold tabular-nums leading-tight">
                              {row.result.pointsText}
                            </span>
                          </Tooltip>
                          {row.result.cumtimeText ? (
                            <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                              {row.result.cumtimeText}
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
