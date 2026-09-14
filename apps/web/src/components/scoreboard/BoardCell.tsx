"use client";

import type { BoardCell as Cell } from "@convex/scoreboard";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { contestMinutes } from "./hall";

const DASH = "—";

/**
 * One problem cell (DESIGN.md section 16.1).
 *
 * solved: the solve minute and the wrong-try count, with the gold ring — or the
 * olympics medal — when it is the first solve of its column. frozen: a `?` and
 * how many submissions are being held. judging: a `?` and the pulse. failed: a
 * cross and the attempt count. Untouched: an em-dash.
 */
export function BoardCell({
  cell,
  label,
  team,
  changed,
  nextUp,
}: {
  cell: Cell;
  label: string;
  team: string;
  changed: boolean;
  nextUp: boolean;
}) {
  const t = useTranslations("contests.hall.cell");
  let value: React.ReactNode = DASH;
  let sub = "";
  let title = t("untouched", { team, label });

  if (cell.state === "solved") {
    value = contestMinutes(cell.time ?? 0);
    sub = cell.wrong ? `+${cell.wrong}` : "";
    title = t("solved", { team, label, minute: contestMinutes(cell.time ?? 0), wrong: cell.wrong });
  } else if (cell.state === "frozen") {
    const held = cell.wrong + cell.pending;
    value = "?";
    sub = t("subFrozen", { count: held });
    title = t("frozen", { team, label, count: held });
  } else if (cell.state === "judging") {
    value = "?";
    sub = t("subJudging", { count: cell.pending });
    title = t("judging", { team, label, count: cell.pending });
  } else if (cell.state === "failed") {
    value = <X className="hall-cell-icon" size={16} strokeWidth={2.5} aria-hidden />;
    sub = t("subFailed", { count: cell.wrong });
    title = t("failed", { team, label, count: cell.wrong });
  }

  return (
    <td
      className="hall-cell"
      data-state={cell.state}
      data-first={cell.firstBlood ? "true" : undefined}
      data-changed={changed ? "true" : undefined}
      data-next={nextUp ? "true" : undefined}
      title={title}
    >
      <span className="hall-cell-value">{value}</span>
      <span className="hall-cell-sub">{sub}</span>
    </td>
  );
}
