import { contestSteps, contestTailSteps } from "./contests.ts";
import { peopleSteps } from "./people.ts";
import { problemSteps } from "./problems.ts";
import { siteSteps, siteTailSteps } from "./site.ts";
import { revisionsStep, socialSteps } from "./social.ts";
import { submissionSteps } from "./submissions.ts";
import type { Step } from "./types.ts";

/**
 * Dependency order. Every step only resolves foreign keys into tables that ran
 * before it, with two documented exceptions handled by a patch at the end:
 * profiles.currentParticipationId, and the self references in comments and
 * navigationBar which are ordered parent first.
 */
export const STEPS: Step[] = [
  ...siteSteps,
  ...peopleSteps,
  ...problemSteps,
  ...contestSteps,
  ...submissionSteps,
  ...contestTailSteps,
  ...socialSteps,
  ...siteTailSteps,
  revisionsStep,
];

export const STEP_TABLES = STEPS.map((step) => step.table);

export type { Step } from "./types.ts";
export { MAP_TARGETS } from "./types.ts";
