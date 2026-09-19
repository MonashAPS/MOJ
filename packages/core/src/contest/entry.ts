/**
 * Who a restricted contest lets in.
 *
 * A restricted contest carries up to two gates: the organisations and classes
 * it names, and the people it names. A gate exists when it names anyone. `match`
 * says whether a competitor has to clear every gate that exists, or any one of
 * them; a restricted contest with no gate at all admits nobody, which the admin
 * mutation refuses to store and the editor warns about before that.
 */

import type { ContestEntry, Viewer } from "../types";

export type RestrictedEntry = Extract<ContestEntry, { kind: "restricted" }>;

/** Whether the entry names an organisation or a class. */
export function organizationGate(entry: RestrictedEntry): boolean {
  return entry.organizationIds.length > 0 || entry.classIds.length > 0;
}

/** Whether the entry names anyone by name. */
export function nameGate(entry: RestrictedEntry): boolean {
  return entry.profileIds.length > 0;
}

function intersects(left: readonly string[], right: readonly string[] | undefined): boolean {
  if (!right) return false;
  const have = new Set(right);

  return left.some((id) => have.has(id));
}

/** Whether a signed-in viewer clears the gates. */
export function entryAdmits(entry: RestrictedEntry, viewer: NonNullable<Viewer>): boolean {
  const gates: boolean[] = [];

  if (organizationGate(entry)) {
    gates.push(
      intersects(entry.organizationIds, viewer.organizationIds) ||
        intersects(entry.classIds, viewer.classIds),
    );
  }

  if (nameGate(entry)) gates.push(entry.profileIds.includes(viewer.id));

  if (gates.length === 0) return false;

  return entry.match === "all" ? gates.every(Boolean) : gates.some(Boolean);
}
