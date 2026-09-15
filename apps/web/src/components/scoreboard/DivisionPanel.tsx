"use client";

import type { Division, ScoreboardBadge } from "@convex/scoreboard";
import { EASE_OUT } from "@moj/ui";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoardCell } from "./BoardCell";
import { type Attendance, cellSignature, type DisplayRow, type RevealTarget } from "./hall";
import { type Pictogram, pictogramFor } from "./olympics";

const FLIP_MS = 700;

/** The pictogram's colour reaches the column head as custom properties, which
 *  React's `CSSProperties` does not describe on its own. */
type SportStyle = React.CSSProperties & { [variable: `--${string}`]: string };

function sportStyle(picture: Pictogram): SportStyle {
  return { "--hall-col": picture.colour, "--hall-col-wash": `${picture.colour}3a` };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easing(): string {
  return `cubic-bezier(${EASE_OUT.join(",")})`;
}

/**
 * One division's grid.
 *
 * Rows move with a FLIP: React writes the new order, then every row that
 * actually moved is animated from where it used to be to where it now is. The
 * alternative — animating the reorder itself — cannot be done without animating
 * layout, which DESIGN.md section 5.1 forbids.
 */
export function DivisionPanel({
  division,
  rows,
  active,
  theme,
  attendance,
  badges,
  inPersonBadge,
  flagTemplate,
  target,
  revealing,
  canEditTags,
  onEditTags,
  panelRef,
}: {
  division: Division;
  rows: DisplayRow[];
  active: boolean;
  theme: string;
  attendance: Attendance;
  badges: ScoreboardBadge[];
  inPersonBadge: string | null;
  flagTemplate: string | null;
  target: RevealTarget | null;
  revealing: boolean;
  canEditTags: boolean;
  onEditTags: (row: DisplayRow) => void;
  panelRef: (node: HTMLDivElement | null) => void;
}) {
  const t = useTranslations("contests.hall");
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);
  const positions = useRef<Map<string, number>>(new Map());
  const seen = useRef<Map<string, string>>(new Map());
  const olympics = theme === "olympics";

  const labels = useMemo(() => Object.fromEntries(badges.map((badge) => [badge.key, badge.label])), [badges]);

  /** Cells whose value differs from the last update this panel drew. */
  const changed = useMemo(() => {
    const next = new Map<string, string>();
    const moved = new Set<string>();
    const first = seen.current.size === 0;

    for (const row of division.rows) {
      row.cells.forEach((cell, index) => {
        const key = `${row.participationId}:${index}`;
        const signature = cellSignature(cell);
        next.set(key, signature);
        const before = seen.current.get(key);

        if (!first && before !== undefined && before !== signature) moved.add(key);
      });
    }

    seen.current = next;

    return moved;
  }, [division]);

  useLayoutEffect(() => {
    const body = bodyRef.current;

    if (!body) return;
    const still = prefersReducedMotion();
    const next = new Map<string, number>();

    for (const node of body.querySelectorAll<HTMLTableRowElement>("tr[data-row]")) {
      const id = node.dataset.row;

      if (!id) continue;
      const top = node.offsetTop;
      next.set(id, top);
      const before = positions.current.get(id);

      if (still || before === undefined) continue;
      const delta = before - top;

      if (Math.abs(delta) < 2 || typeof node.animate === "undefined") continue;
      node.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
        duration: FLIP_MS,
        easing: easing(),
      });
    }

    positions.current = next;
  });

  return (
    <div
      className="hall-panel scroll-quiet"
      data-active={active ? "true" : "false"}
      data-division={division.key}
      aria-hidden={!active}
      ref={panelRef}
    >
      {rows.length === 0 ? (
        <p className="hall-empty">{division.rows.length ? t("emptyInPerson") : t("emptyDivision")}</p>
      ) : (
        <table className="hall-table">
          <thead>
            <tr>
              <th className="hall-rank" scope="col">
                #
              </th>
              <th className="hall-team" scope="col">
                {t("columnTeam")}
              </th>
              {division.problems.map((problem, index) => {
                const picture = olympics ? pictogramFor(division.key, problem.code, index) : null;

                return (
                  <th
                    key={problem.contestProblemId}
                    className="hall-prob"
                    scope="col"
                    title={problem.name || problem.label}
                    data-sport={picture?.sport}
                    style={picture ? sportStyle(picture) : undefined}
                  >
                    {picture ? (
                      <img className="hall-pictogram" src={picture.src} alt={problem.label} />
                    ) : (
                      problem.label
                    )}
                  </th>
                );
              })}
              <th className="hall-prob" scope="col">
                {t("columnSolved")}
              </th>
              <th className="hall-prob" scope="col">
                {t("columnTime")}
              </th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.map((row, position) => {
              const isTarget = revealing && target?.rowIndex === position;
              const isDone = revealing && target !== null && position < target.rowIndex;

              return (
                <tr
                  key={row.participationId}
                  data-row={row.participationId}
                  data-rank={row.displayRank}
                  data-position={position + 1}
                  data-reveal={isTarget ? "target" : isDone ? "done" : undefined}
                >
                  <td className="hall-rank">{row.displayRank}</td>
                  <td className="hall-team">
                    {flagTemplate ? (
                      <img
                        className="hall-flag"
                        src={flagTemplate.replace("{username}", encodeURIComponent(row.username))}
                        alt=""
                        // The event names a URL per competitor without checking it, so
                        // some of them will not exist. A competitor without a flag
                        // should look like one, not like a broken page.
                        onError={(problem) => {
                          problem.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    {row.displayName}
                    {row.badges.map((key) =>
                      // Filtered to the hall, every visible row carries the in-person
                      // badge, so showing it is just noise.
                      attendance === "in-person" && key === inPersonBadge ? null : (
                        <span key={key} className="hall-badge">
                          {labels[key] ?? key}
                        </span>
                      ),
                    )}
                    {canEditTags ? (
                      <button
                        type="button"
                        className="hall-row-edit"
                        title={t("editBadgesFor", { name: row.displayName })}
                        aria-label={t("editBadgesFor", { name: row.displayName })}
                        onClick={() => onEditTags(row)}
                      >
                        <Pencil size={12} strokeWidth={2} aria-hidden />
                      </button>
                    ) : null}
                  </td>
                  {row.cells.map((cell, index) => (
                    <BoardCell
                      // biome-ignore lint/suspicious/noArrayIndexKey: the column order is the identity
                      key={index}
                      cell={cell}
                      label={division.problems[index]?.label ?? String(index + 1)}
                      team={row.displayName}
                      changed={changed.has(`${row.participationId}:${index}`)}
                      nextUp={isTarget && target?.cellIndex === index}
                    />
                  ))}
                  <td className="hall-solved">{row.solved}</td>
                  <td className="hall-penalty">{row.penalty}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
