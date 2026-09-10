"use client";

import type { BoardCell as Cell } from "@convex/scoreboard";
import { X } from "lucide-react";
import { contestMinutes, plural } from "./hall";

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
  let value: React.ReactNode = DASH;
  let sub = "";
  let title = `${team}, problem ${label}`;

  if (cell.state === "solved") {
    value = contestMinutes(cell.time ?? 0);
    sub = cell.wrong ? `+${cell.wrong}` : "";
    title = `${title}: solved at minute ${contestMinutes(cell.time ?? 0)}${
      cell.wrong ? ` after ${plural(cell.wrong, "wrong try", "wrong tries")}` : ""
    }`;
  } else if (cell.state === "frozen") {
    const held = cell.wrong + cell.pending;
    value = "?";
    sub = plural(held, "sub", "subs");
    title = `${title}: ${plural(held, "submission", "submissions")}, result withheld until the freeze lifts`;
  } else if (cell.state === "judging") {
    value = "?";
    sub = cell.pending === 1 ? "judging" : `${cell.pending} judging`;
    title = `${title}: ${plural(cell.pending, "submission", "submissions")} still with the judge`;
  } else if (cell.state === "failed") {
    value = <X className="hall-cell-icon" size={16} strokeWidth={2.5} aria-hidden />;
    sub = plural(cell.wrong, "try", "tries");
    title = `${title}: ${plural(cell.wrong, "attempt", "attempts")}, not solved`;
  } else {
    title = `${title}: not attempted`;
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
