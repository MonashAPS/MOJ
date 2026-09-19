/**
 * Files attached to a contest or a problem: an editorial, a printed statement
 * booklet, sample data too big for the statement.
 */

import type { ArtefactVisibility } from "./types";

export interface ArtefactAudience {
  /** The viewer edits the contest or problem the file is attached to. */
  readonly canEdit: boolean;
  /** The viewer can see that contest or problem at all. */
  readonly canView: boolean;
  /** The contest has ended; always false for a problem's file. */
  readonly ended: boolean;
}

/** Whether a viewer may download a file with this visibility. */
export function artefactIsVisible(visibility: ArtefactVisibility, audience: ArtefactAudience): boolean {
  if (audience.canEdit) return true;

  if (!audience.canView) return false;

  return visibility === "everyone" || (visibility === "afterEnd" && audience.ended);
}
